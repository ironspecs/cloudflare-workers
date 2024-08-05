export interface Env {
	// See https://developers.cloudflare.com/workers/runtime-apis/kv/
	ENVIRONMENT?: string;

	EMAIL: KVNamespace;
	API_KEYS: Fetcher;

	ALLOWED_ORIGINS?: string;
	ALLOWED_AUTH_KEYS?: string;
}

const KEY_MIN_SIZE = 10;
const KEY_MAX_SIZE = 500;
const KEY_REGEX = /^[a-zA-Z0-9]+$/;
const ORIGIN_REGEX = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*(:[0-9]+)?$/;

export const isFunction = (x: unknown): x is Function => typeof x === 'function';
export const isString = (x: unknown): x is string => typeof x === 'string';
export const isNonNullObject = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null;
export const isAlphaNumeric = (x: string): boolean => KEY_REGEX.test(x);
export const isValidKey = (x: string): boolean => x.length >= KEY_MIN_SIZE && x.length <= KEY_MAX_SIZE && isAlphaNumeric(x);
export const isOrigin = (x: string): boolean => ORIGIN_REGEX.test(x);
export const isHeaders = (headers: any): headers is Headers => isFunction(headers.getAll) && isFunction(headers.forEach);

/**
 * Get the list of allowed origins. This is a comma-separated list of origins
 * that are allowed to make requests to the worker.
 */
export const getAllowedOrigins = (env: Env): string[] => {
	if (!('ALLOWED_ORIGINS' in env) || !isString(env.ALLOWED_ORIGINS)) {
		return [];
	}

	return env.ALLOWED_ORIGINS.split(',').filter(isOrigin);
};

/**
 * Get the list of allowed auth keys. This is a combination of the
 * ALLOWED_AUTH_KEYS environment variable and any environment variables
 * that start with "SECRET_AUTH_KEY_". The latter is used to allow
 * setting auth keys as secrets in production environments without exposing them
 * in the Cloudflare dashboard.
 */
export const getAuthKeys = (env: Env): string[] => {
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
