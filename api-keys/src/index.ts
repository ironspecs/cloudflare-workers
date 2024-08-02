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
 *
 */

import { KVNamespace } from '@cloudflare/workers-types/experimental';
import { object, string, number, unknown, array, minLength, maxLength, is, optional } from 'valibot';

export interface Env {
	// See https://developers.cloudflare.com/workers/runtime-apis/kv/
	API_KEYS: KVNamespace;
	ALLOWED_ORIGINS?: string;
	ALLOWED_AUTH_KEYS?: string;
}

const KEY_MIN_SIZE = 10;
const KEY_MAX_SIZE = 500;
const VALUE_MAX_SIZE = 500;
const ID_MIN_SIZE = 10;
const ID_MAX_SIZE = 500;
const POLICIES_NUM_MAX = 1000;
const KEY_REGEX = /^[a-zA-Z0-9]+$/;
const ORIGIN_REGEX = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*(:[0-9]+)?$/;
const API_KEY_PATH = '/api-keys/';
const apiKeysKVPrefix = 'API_KEYS/';

const isString = (x: unknown): x is string => typeof x === 'string';
const isNonNullObject = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null;
const isAlphaNumeric = (x: string): boolean => KEY_REGEX.test(x);
export const isValidKey = (x: string): boolean => x.length >= KEY_MIN_SIZE && x.length <= KEY_MAX_SIZE && isAlphaNumeric(x);
export const isOrigin = (x: string): boolean => ORIGIN_REGEX.test(x);

/// A policy for an API key. Prefer using the name to identify the policy instead any value
/// in the config since we can deserialize the name into an enum in clients to optimize away
/// code paths.
const ApiKeyPolicySchema = object({
	/// The name of the policy. Is meant to be deserialized into an enum in clients.
	name: string([minLength(ID_MIN_SIZE), maxLength(ID_MAX_SIZE)]),
	/// Often null.
	config: object({}, unknown()),
});

const ApiKeyInfoSchema = object({
	/// The API key's key, used to self-identify when passed around.
	key: string([minLength(ID_MIN_SIZE), maxLength(ID_MAX_SIZE)]),
	/// The tenant ID of the API key.
	tenantId: string([minLength(ID_MIN_SIZE), maxLength(ID_MAX_SIZE)]),
	/// Unix timestamp in seconds. It's valid to return expired API keys so clients can
	/// cache the API key information.
	expires: number(),
	/// The policies that the API key has.
	policies: array(ApiKeyPolicySchema, [maxLength(POLICIES_NUM_MAX)]),
});

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

export const getAllowedOrigins = (env: Env): string[] => {
	if (!('ALLOWED_ORIGINS' in env) || !isString(env.ALLOWED_ORIGINS)) {
		return [];
	}

	return env.ALLOWED_ORIGINS.split(',').filter(isOrigin);
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight requests. This is needed since the API keys are
		// accessed from other websites. This is only needed for PUT/POST/DELETE requests.
		// See https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#preflighted_requests
		// for more information. The Access-Control-Max-Age header is set to 1 day
		// to reduce the number of preflight requests, which is the maximum value allowed
		// by Cloudflare.
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

		if (['PUT', 'POST', 'DELETE'].includes(request.method)) {
			// Check that request comes from an allowed origin by checking the Origin header
			// against the ALLOWED_ORIGINS environment variable. This is to prevent
			// unauthorized access to the API from other websites. Only check for PUT/POST/DELETE requests
			// since browsers may not send the Origin header for GET requests.
			const allowedOrigins = getAllowedOrigins(env);
			const origin = request.headers.get('Origin');
			if (!origin || !allowedOrigins.includes(origin)) {
				return new Response('Invalid origin', { status: 400 });
			}

			// Check that the request has a valid auth key for methods that modify the API keys. An auth key
			// is only needed for PUT/POST/DELETE requests since they modify the API keys.
			const authKeys = getAuthKeys(env);
			const authorization = request.headers.get('Authorization');
			if (!authorization || !authKeys.includes(authorization)) {
				return new Response('Invalid auth key', { status: 400 });
			}
		}

		const url = new URL(request.url);
		const pathname = url.pathname;
		if (pathname.startsWith(API_KEY_PATH)) {
			const key = pathname.slice(API_KEY_PATH.length);

			// Limit the size of the key and reject non-alphanumeric characters.
			if (!isValidKey(key)) {
				return new Response('Invalid key', { status: 400 });
			}

			if (request.method === 'GET') {
				const value = await env.API_KEYS.get(`${apiKeysKVPrefix}/${key}`);
				let response = null;
				if (!value) {
					response = new Response('Not found', { status: 404 });
				} else {
					response = new Response(value);
				}
				response.headers.set('Cache-Control', 'max-age=3600');
				// response.cf.cacheEverything = true;
				return response;
			} else if (request.method === 'PUT') {
				// Check for a valid content type.
				const contentType = request.headers.get('content-type');
				if (contentType !== 'application/json') {
					return new Response('Invalid content type', { status: 400 });
				}

				const text = await request.text();

				// Limit the size of the request body.
				if (text.length > VALUE_MAX_SIZE) {
					return new Response('Request body too large', { status: 400 });
				}

				let value = null;
				try {
					value = JSON.parse(text);
				} catch (e) {
					return new Response('Invalid JSON', { status: 400 });
				}

				if (!isNonNullObject(value)) {
					return new Response('Invalid Object', { status: 400 });
				}
				// Add the key to the object, override if it already exists.
				// This is to ensure that the key is not set by the user.
				value.key = key;

				if (!is(ApiKeyInfoSchema, value)) {
					return new Response('Invalid ApiKeyInfo', { status: 400 });
				}

				// It's okay to overwrite the value if it already exists.
				await env.API_KEYS.put(`${apiKeysKVPrefix}/${key}`, JSON.stringify(value));
				return new Response('OK');
			} else if (request.method === 'DELETE') {
				await env.API_KEYS.delete(`${apiKeysKVPrefix}/${key}`);
				return new Response('OK');
			} else {
				return new Response('Invalid method', { status: 405 });
			}
		}

		return new Response('Not found', { status: 404 });
	},
};
