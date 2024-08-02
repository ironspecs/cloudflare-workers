import { Env, getAllowedOrigins, getAuthKeys, isValidEmail } from './common';
import { MailchannelsEmailProvider } from './email-providers/mailchannels';
import {
	EmailContactSchema,
	EmailContentSchema,
	EmailDkimConfigSchema,
	EmailDkimConfig,
	MockEmailProvider,
	TransactionalEmailProvider,
} from './emails';
import { safeParse, object, string } from 'valibot';

const logsKVPrefix = 'LOGS';
const dkimConfigsKVPrefix = 'DKIM_CONFIGS';
const deadLetterQueueKVPrefix = 'DEAD_LETTER_QUEUE';

/**
 * Get the transactional email provider to use based on the current environment.
 * In production environments, the MailchannelsEmailProvider will be used. In
 * all other environments, the MockEmailProvider will be used.
 */
const getTransactionalEmailProvider = (env: Env): TransactionalEmailProvider => {
	if (env.ENVIRONMENT === 'production') {
		return new MailchannelsEmailProvider();
	}

	return new MockEmailProvider();
};

/**
 * Handle the /retry route. This route will attempt to resend any emails that
 * failed to send on the first attempt. The route will return a 200 response
 * if the retry was successful.
 */
const handleRetryFailedEmailsRoute = async (env: Env) => {
	const failedEmails = await env.EMAIL.list({ prefix: deadLetterQueueKVPrefix });
	for (const key of failedEmails.keys) {
		const emailData = await env.EMAIL.get(key.name);

		if (emailData) {
			const { to, from, subject, content, dkim } = JSON.parse(emailData);
			const emailSender = getTransactionalEmailProvider(env);
			const response = await emailSender.sendEmail({ to, from, subject, content, dkim });

			if (response.status === 200) {
				await env.EMAIL.delete(key.name);
			}
		}
	}

	return new Response('Retries triggered');
};

/**
 * Get the DKIM configuration for a given domain. This function will return
 * null if the domain does not have a DKIM configuration.
 */
const getDkimConfig = async (domain: string, env: Env): Promise<EmailDkimConfig | null> => {
	const dkimConfig = await env.EMAIL.get(`${dkimConfigsKVPrefix}/${domain}`, 'json');
	return dkimConfig ? (dkimConfig as EmailDkimConfig) : null;
};

/**
 * Handle the /send-email route. This route expects a POST request with a JSON
 * body containing the following fields:
 * - to: An object with an email and optional name field.
 * - from: An object with an email and optional name field.
 * - subject: A string with the email subject.
 * - content: An object with a type field (either 'text/plain' or 'text/html')
 *  and a value field with the email content.
 *
 * The route will validate the request body and send the email using the
 * configured transactional email provider. If the email fails to send, it will
 * be added to the dead letter queue for retry.
 *
 * The route will return a 200 response if the email was sent successfully, or
 * a 400 response if the request body was invalid.
 */
const handleSendEmailRoute = async (request: Request, env: Env): Promise<Response> => {
	const contentType = request.headers.get('content-type');
	if (contentType !== 'application/json') {
		return new Response('Invalid content type', { status: 400 });
	}

	const parsedBody = safeParse(
		object({
			to: EmailContactSchema,
			from: EmailContactSchema,
			subject: string(),
			content: EmailContentSchema,
		}),
		await request.json(),
	);

	if (!parsedBody.success) {
		return new Response('Invalid request body', { status: 400 });
	}

	const { to, from, subject, content } = parsedBody.output;

	if (!isValidEmail(to.email) || !isValidEmail(from.email)) {
		return new Response('Invalid email address', { status: 400 });
	}

	const transactionalEmailProvider = getTransactionalEmailProvider(env);

	const dkim = await getDkimConfig(from.email.split('@')[1], env);
	if (!dkim) {
		return new Response('DKIM not configured', { status: 400 });
	}

	const response = await transactionalEmailProvider.sendEmail({ to, from, subject, content, dkim });

	if (response.status !== 200) {
		const key = Date.now().toString();
		await env.EMAIL.put(`${deadLetterQueueKVPrefix}/${key}`, JSON.stringify({ to, from, subject, content, dkim }));
		return new Response('Failed to send email, queued for retry', { status: response.status });
	}

	await env.EMAIL.put(`${logsKVPrefix}/${Date.now().toString()}`, JSON.stringify({ to, from, subject, content, dkim }));
	return new Response('Email sent successfully');
};

/**
 * Handle OPTIONS requests by returning the appropriate CORS headers.
 */
const handleOptionsRequest = (): Response => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': 'same-site',
			'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE',
			'Access-Control-Allow-Headers': 'Authorization, Content-Type',
			'Access-Control-Max-Age': '86400',
		},
	});
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return handleOptionsRequest();
		}

		const allowedOrigins = getAllowedOrigins(env);
		const origin = request.headers.get('Origin');
		if (!origin || !allowedOrigins.includes(origin)) {
			return new Response('Invalid origin', { status: 400 });
		}

		const authKeys = getAuthKeys(env);
		const authorization = request.headers.get('Authorization');
		if (!authorization || !authKeys.includes(authorization)) {
			return new Response('Invalid auth key', { status: 400 });
		}

		const pathname = new URL(request.url).pathname;

		if (pathname === '/send-email' && request.method === 'POST') {
			return handleSendEmailRoute(request, env);
		}

		if (pathname === '/dkim-configs' && request.method === 'GET') {
			const domain = new URL(request.url).searchParams.get('domain');
			if (!domain) {
				return new Response('Invalid domain', { status: 400 });
			}

			const dkimConfig = await getDkimConfig(domain, env);
			return dkimConfig ? new Response(JSON.stringify(dkimConfig)) : new Response('Not found', { status: 404 });
		}

		if (pathname.startsWith('/dkim-configs/') && request.method === 'PUT') {
			// get the key from the URL
			const domain = new URL(request.url).pathname.split('/').pop();
			if (!domain) {
				return new Response('Invalid domain', { status: 400 });
			}

			const contentType = request.headers.get('content-type');
			if (contentType !== 'application/json') {
				return new Response('Invalid content type', { status: 400 });
			}

			const parsedBody = safeParse(EmailDkimConfigSchema, await request.json());
			if (!parsedBody.success) {
				return new Response('Invalid request body', { status: 400 });
			}

			await env.EMAIL.put(`${dkimConfigsKVPrefix}/${domain}`, JSON.stringify(parsedBody.output));
			return new Response('DKIM config updated');
		}

		if (pathname.startsWith('/retry/') && request.method === 'GET') {
			return handleRetryFailedEmailsRoute(env);
		}

		if (pathname.startsWith('/email-logs/')) {
			const key = pathname.slice('/email-logs/'.length);

			if (request.method === 'GET') {
				const value = await env.EMAIL.get(`${logsKVPrefix}/${key}`);
				return value ? new Response(value) : new Response('Not found', { status: 404 });
			} else if (request.method === 'DELETE') {
				await env.EMAIL.delete(`${logsKVPrefix}/${key}`);
				return new Response('OK');
			} else {
				return new Response('Invalid method', { status: 405 });
			}
		}

		return new Response('Not found', { status: 404 });
	},
};
