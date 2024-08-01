import { Env, isAlphaNumeric, isOrigin, isString, isValidEmail } from './common';
import { MailchannelsEmailProvider } from './email-providers/mailchannels';
import { EmailDkimConfig, MockEmailProvider, TransactionalEmailProvider } from './emails';

export const getAllowedOrigins = (env: Env): string[] => {
	if (!('ALLOWED_ORIGINS' in env) || !isString(env.ALLOWED_ORIGINS)) {
		return [];
	}

	return env.ALLOWED_ORIGINS.split(',').filter(isOrigin);
};

/// Get the list of allowed auth keys. This is a combination of the
/// ALLOWED_AUTH_KEYS environment variable and any environment variables
/// that start with "SECRET_AUTH_KEY_". The latter is used to allow
/// setting auth keys as secrets in production environments without exposing them
/// in the Cloudflare dashboard.
const getAuthKeys = (env: Env): string[] => {
	// If no auth keys allowed, block all requests.
	if (!('ALLOWED_AUTH_KEYS' in env) || !isString(env.ALLOWED_AUTH_KEYS)) {
		return [];
	}
	// The passthrough and test auth keys are plain-text comma separated values,
	// and won't be set in production environments.
	const authKeys = env.ALLOWED_AUTH_KEYS.split(',');

	// Get any environment variables that begin with "SECRET_AUTH_KEY_"
	// and add them to the list of allowed auth keys.
	for (const [name, value] of Object.entries(env)) {
		if (name.startsWith('SECRET_AUTH_KEY_')) {
			authKeys.push(value);
		}
	}

	return authKeys.filter(isAlphaNumeric);
};

function getEmailSender(env: Env): TransactionalEmailProvider {
	if (env.ENVIRONMENT === 'production') {
		return new MailchannelsEmailProvider();
	}

	return new MockEmailProvider();
}

async function retryFailedEmails(env: Env) {
	const failedEmails = await env.DEAD_LETTER_QUEUE.list();
	for (const key of failedEmails.keys) {
		const emailData = await env.DEAD_LETTER_QUEUE.get(key.name);
		if (emailData) {
			const { to, from, subject, content, dkim } = JSON.parse(emailData);
			const emailSender = getEmailSender(env);
			const response = await emailSender.sendEmail({ to, from, subject, content, dkim });
			if (response.status === 200) {
				await env.DEAD_LETTER_QUEUE.delete(key.name);
			}
		}
	}
}

async function getDkimConfig(domain: string, env: Env): Promise<EmailDkimConfig | null> {
	const dkimConfig = await env.DKIM_CONFIGS.get(domain, 'json');
	return dkimConfig ? (dkimConfig as EmailDkimConfig) : null;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': 'same-site',
					'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE',
					'Access-Control-Allow-Headers': 'Authorization, Content-Type',
					'Access-Control-Max-Age': '86400',
				},
			});
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
			const contentType = request.headers.get('content-type');
			if (contentType !== 'application/json') {
				return new Response('Invalid content type', { status: 400 });
			}

			const { to, from, subject, content } = await request.json();

			if (!isValidEmail(to)) {
				return new Response('Invalid email address', { status: 400 });
			}

			const emailSender = getEmailSender(env);

			const dkim = await getDkimConfig(from.email.split('@')[1], env);
			if (!dkim) {
				return new Response('DKIM not configured', { status: 400 });
			}

			const response = await emailSender.sendEmail({ to, from, subject, content, dkim });

			if (response.status !== 200) {
				const key = Date.now().toString();
				await env.DEAD_LETTER_QUEUE.put(key, JSON.stringify({ to, from, subject, content, dkim }));
				return new Response('Failed to send email, queued for retry', { status: response.status });
			}

			await env.EMAIL_LOGS.put(Date.now().toString(), JSON.stringify({ to, from, subject, content, dkim }));
			return new Response('Email sent successfully');
		}

		if (pathname.startsWith('/retry/') && request.method === 'GET') {
			await retryFailedEmails(env);
			return new Response('Retries triggered');
		}

		if (pathname.startsWith('/email-logs/')) {
			const key = pathname.slice('/email-logs/'.length);

			if (request.method === 'GET') {
				const value = await env.EMAIL_LOGS.get(key);
				return value ? new Response(value) : new Response('Not found', { status: 404 });
			} else if (request.method === 'DELETE') {
				await env.EMAIL_LOGS.delete(key);
				return new Response('OK');
			} else {
				return new Response('Invalid method', { status: 405 });
			}
		}

		return new Response('Not found', { status: 404 });

		return new Response('Not found', { status: 404 });
	},
};
