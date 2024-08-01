export interface Env {
	// See https://developers.cloudflare.com/workers/runtime-apis/kv/
	ENVIRONMENT?: string;

	EMAIL_LOGS: KVNamespace;
	DEAD_LETTER_QUEUE: KVNamespace;
	DKIM_CONFIGS: KVNamespace;

	API_KEYS: KVNamespace;
	ALLOWED_ORIGINS?: string;
	ALLOWED_AUTH_KEYS?: string;
}

const KEY_MIN_SIZE = 10;
const KEY_MAX_SIZE = 500;
const KEY_REGEX = /^[a-zA-Z0-9]+$/;
const ORIGIN_REGEX = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*(:[0-9]+)?$/;
const VALID_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const isString = (x: unknown): x is string => typeof x === 'string';
export const isNonNullObject = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null;
export const isAlphaNumeric = (x: string): boolean => KEY_REGEX.test(x);
export const isValidKey = (x: string): boolean => x.length >= KEY_MIN_SIZE && x.length <= KEY_MAX_SIZE && isAlphaNumeric(x);
export const isOrigin = (x: string): boolean => ORIGIN_REGEX.test(x);
export const isValidEmail = (x: string): boolean => VALID_EMAIL_REGEX.test(x);

export function isHeaders(headers: any): headers is Headers {
	return typeof headers.getAll === 'function' && typeof headers.forEach === 'function';
}
