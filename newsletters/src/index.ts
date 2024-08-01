/**
 * A Cloudflare Worker that implements an API for managing API keys. API keys are stored
 * in the API_KEYS KV store. The API is protected by an auth key that is passed in the
 * Authorization header. The API is also protected by CORS by checking the Origin header
 * against the ALLOWED_ORIGINS environment variable. The API is meant to be used by
 * other websites, so it's important to restrict access to the API to prevent unauthorized
 * access.
 *
 * The API is NOT protected by rate limiting since it will contain the policies for rate-limiting
 * other services, therefore it's important to only use strong auth keys. Instead, we will rely on
 * Cloudflare's anti-DDoS protection to prevent brute force attacks. The API is also not
 * protected by a CSRF token since it's not meant to be used by forms.
 *
 * In non-production environments, the API has known auth keys that are used for testing, set in
 * plain text in the ALLOWED_AUTH_KEYS environment variable. In production environments, the
 * ALLOWED_AUTH_KEYS environment variable is empty and the auth keys are set as secrets in the
 * Cloudflare dashboard. The secret auth keys are set as secrets in Cloudflare that begin with
 * the prefix "SECRET_AUTH_KEY_" so they can be rotated easily, or have different auth keys for
 * different services, i.e., SECRET_AUTH_KEY_SERVICE_A, SECRET_AUTH_KEY_SERVICE_B, etc.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see worker in action
 * - Run `npm run deploy` to publish worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Env } from './common';
import htmlContent from './index.html';
import { createHTMLResponse, createMethodNotAllowedResponse, createNotFoundResponse } from './lib/responses';
import { handle } from './lib/requests';
import { EmailConfirm, getListConfigRecordByUniqueValues } from './db/list-config-records';
import { confirmEmail, subscribe, unsubscribe } from './domain/subscriptions';
import { object, optional, string, email as validEmail } from 'valibot';

export type RouteHandler = (request: Request, env: Env) => Promise<Response>;

const handleSendUserConfirmationEmail = handle(object({}), (_, env, {}) => Promise.resolve({ success: true, value: '' }));

/**
 */
const handleSubscribe = handle(
	object({
		query: object({}),
		body: object({
			email: string([validEmail()]),
			hostname: string(),
			list_name: string(),
			person_name: optional(string()),
		}),
	}),
	async (_, env, { body }) => {
		const subscribeResults = await subscribe(env, body);
		if (!subscribeResults.success) {
			return subscribeResults;
		}

		const listConfig = await getListConfigRecordByUniqueValues(env.NewslettersD1, body);

		if (listConfig !== null && listConfig.email_confirm === EmailConfirm.Link) {
			// TODO: Send the user an email with a link to confirm their email address.
			// TODO: Add google captcha check.
			// TODO: Add CSRF token check.
		}

		return subscribeResults;
	},
);

/**
 * If they return a token, we can unsubscribe them right away because they
 * came from an email. If they don't return a token, only show a UI without
 * any PII. If they enter correct PII, then generate the token and recall
 * this endpoint with that new token.
 */
const handleUnsubscribe = handle(
	object({
		query: object({}),
		body: object({
			email: string([validEmail()]),
			hostname: string(),
			list_name: string(),
			token: optional(string()),
		}),
	}),
	(_, env, { body }) => unsubscribe(env, body),
);

/**
 * If wanted, an email can include an email confirmation link. This is
 * useful to prevent bots.
 */
const handleConfirmEmail = handle(
	object({
		query: object({}),
		body: object({
			token: string(),
			hostname: string(),
		}),
	}),
	(_, env, { body }) => confirmEmail(env, body),
);

const routes = {
	'/subscribe': {
		get: handleSubscribe,
		post: handleSubscribe,
	},
	'/join': {
		get: handleSubscribe,
		post: handleSubscribe,
	},
	'/unsubscribe': {
		get: handleUnsubscribe,
		post: handleUnsubscribe,
	},
	'/leave': {
		get: handleUnsubscribe,
		post: handleUnsubscribe,
	},
	'/verify': {
		get: handleConfirmEmail,
	},
	'/confirm': {
		get: handleConfirmEmail,
	},
	'/confirm/send': {
		get: handleSendUserConfirmationEmail,
	},
} as Record<string, { [key: string]: RouteHandler }>;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const pathname = new URL(request.url).pathname;

		if (routes[pathname]) {
			// Add rate-limiting here for public routes

			const route = routes[pathname];
			const method = request.method.toLowerCase();
			if (method in route) {
				return route[method](request, env);
			}

			return createMethodNotAllowedResponse();
		}

		if (request.method === 'GET') {
			// If they have the right API key, they may be able to download the list of subscribers.
			switch (pathname) {
				case '/':
					return createHTMLResponse(htmlContent);
			}
		}

		return createNotFoundResponse();
	},
};
