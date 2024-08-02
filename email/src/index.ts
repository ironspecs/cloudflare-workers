import { Env, getAllowedOrigins } from './common';
import {
	ApiKeyInfo,
	EmailContactSchema,
	EmailContentSchema,
	EmailDkimConfigSchema,
} from './domain/types';
import { safeParse, object, string, array } from 'valibot';
import { Logger, LogRouter } from './domain/logger';
import { getDkimConfig, saveDKIMConfig } from './domain/dkim';
import { getApiKeyInfo } from './domain/api-keys';
import { getTransactionalEmailProvider } from './domain/emails';

const deadLetterQueueKVPrefix = 'DEAD_LETTER_QUEUE';

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
			const emailSender = getTransactionalEmailProvider('mailchannels');
			const response = await emailSender.sendEmail({ to, from, subject, content, dkim });

			if (response.status === 200) {
				await env.EMAIL.delete(key.name);
			}
		}
	}

	return new Response('Retries triggered');
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
			to: array(EmailContactSchema),
			from: EmailContactSchema,
			subject: string(),
			content: array(EmailContentSchema),
		}),
		await request.json(),
	);

	if (!parsedBody.success) {
		return new Response('Invalid request body', { status: 400 });
	}

	// Always check auth key because this is a private API.
	const policies = await getRequestPolicies(request);
	if (!policies) {
		return new Response('Invalid auth key', { status: 400 });
	}
	const emailSendPolicy = policies.find((p) => p.name === 'email:send');
	if (!emailSendPolicy) {
		return new Response('Invalid auth key', { status: 400 });
	}
	const {
		emailProviderName
	} = emailSendPolicy.config;

	const { to, from, subject, content } = parsedBody.output;

	const dkim = await getDkimConfig(env, from.email.split('@')[1]);
	if (!dkim) {
		return new Response('DKIM not configured', { status: 400 });
	}

	const ts = Date.now().toString();
	const response = await getTransactionalEmailProvider(emailProviderName).sendEmail({ to, from, subject, content, dkim });

	if (response.status !== 200) {
		await env.EMAIL.put(`${deadLetterQueueKVPrefix}/${ts}`, JSON.stringify({ to, from, subject, content, dkim }));
		await new Logger(env, policies).logEvent('email_failed', { to, from, subject, content, dkim });
		return new Response('Failed to send email, queued for retry', { status: response.status });
	}

	await new Logger(env, policies).logEvent('email_sent', { to, from, subject, content, dkim });
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



/**
 * Get the policies associated with the request.
 */
const getRequestPolicies = async (request: Request): Promise<ApiKeyInfo['policies'] | null> => {
	const authorization = request.headers.get('Authorization');
	if (!authorization) {
		return null;
	}

	const apiKeyInfo = await getApiKeyInfo(authorization);
	if (!apiKeyInfo) {
		return null;
	}
	return apiKeyInfo.policies;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return handleOptionsRequest();
		}

		// If POST/PUT/DELETE, check origin.
		if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
			const allowedOrigins = getAllowedOrigins(env);
			const origin = request.headers.get('Origin');
			if (!origin || !allowedOrigins.includes(origin)) {
				return new Response('Invalid origin', { status: 400 });
			}
		}

		// This is a private API, so always check auth.
		const policies = await getRequestPolicies(request);
		if (!policies) {
			return new Response('Invalid authorization.', { status: 400 });
		}

		const pathname = new URL(request.url).pathname;

		if (pathname === '/send-email' && request.method === 'POST') {
			return handleSendEmailRoute(request, env);
		}

		if (pathname.startsWith('/dkim-configs') && request.method === 'GET') {
			const domain = new URL(request.url).searchParams.get('domain');
			if (!domain) {
				return new Response('Invalid domain', { status: 400 });
			}

			const dkimConfig = await getDkimConfig(env, domain);
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

			await saveDKIMConfig(env, parsedBody.output);

			return new Response('DKIM config updated');
		}

		if (pathname.startsWith('/retry/') && request.method === 'GET') {
			return handleRetryFailedEmailsRoute(env);
		}

		if (pathname.startsWith('/logs/')) {
			const key = pathname.slice('/logs/'.length);

			if (request.method === 'GET') {
				// If no key is provided, return a list of the latest logs
				if (!key) {
					return new LogRouter(env, policies).listEvents();
				}

				return new LogRouter(env, policies).readEvent(key);
			} else if (request.method === 'DELETE') {
				return new LogRouter(env, policies).deleteEvent(key);
			} else {
				return new Response('Invalid method', { status: 405 });
			}
		}

		return new Response('Not found', { status: 404 });
	},
};
