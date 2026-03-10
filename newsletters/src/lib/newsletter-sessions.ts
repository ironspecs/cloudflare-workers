import type { Env } from '../common';
import { NEWSLETTER_SESSION_TTL_SECONDS, isTimeExpired } from '../common';
import { fromBase64Url, hmacSha256Base64Url, timingSafeEqualStrings, toBase64Url } from './crypto';
import { getActiveHostnameConfigKek } from './hostname-config-secrets';
import type { NewsletterMode } from './newsletter-mode';
import { Err, OK, type Result } from './results';

export const enum NewsletterSessionAction {
	Subscribe = 'subscribe',
	Unsubscribe = 'unsubscribe',
}

export type NewsletterSubmitTokenPayload = {
	action: NewsletterSessionAction;
	created_at: number;
	expires_at: number;
	hostname: string;
	mode: NewsletterMode;
	origin: string;
	v: 1;
};

const decodeUtf8 = (value: Uint8Array) => new TextDecoder().decode(value);
const encodeUtf8 = (value: string) => new TextEncoder().encode(value);

const isNewsletterSubmitTokenPayload = (value: unknown): value is NewsletterSubmitTokenPayload => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const payload = value as Partial<NewsletterSubmitTokenPayload>;
	return (
		payload.v === 1 &&
		typeof payload.action === 'string' &&
		typeof payload.created_at === 'number' &&
		typeof payload.expires_at === 'number' &&
		typeof payload.hostname === 'string' &&
		(payload.mode === 'demo' || payload.mode === 'live') &&
		typeof payload.origin === 'string'
	);
};

const serializeSubmitTokenPayload = (payload: NewsletterSubmitTokenPayload): string => JSON.stringify(payload);

const signSubmitToken = async (env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>, encodedPayload: string): Promise<string> => {
	return hmacSha256Base64Url(getActiveHostnameConfigKek(env), encodedPayload);
};

const createSubmitToken = async (env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>, payload: NewsletterSubmitTokenPayload): Promise<string> => {
	const encodedPayload = toBase64Url(encodeUtf8(serializeSubmitTokenPayload(payload)));
	const signature = await signSubmitToken(env, encodedPayload);
	return `${encodedPayload}.${signature}`;
};

const parseSubmitToken = (
	token: string,
): Result<{ encodedPayload: string; payload: NewsletterSubmitTokenPayload; signature: string }, 'INVALID_SESSION'> => {
	const [encodedPayload, signature] = token.split('.');
	if (!encodedPayload || !signature) {
		return Err('INVALID_SESSION');
	}

	try {
		const payload = JSON.parse(decodeUtf8(fromBase64Url(encodedPayload))) as unknown;
		if (!isNewsletterSubmitTokenPayload(payload)) {
			return Err('INVALID_SESSION');
		}

		return OK({ encodedPayload, payload, signature });
	} catch {
		return Err('INVALID_SESSION');
	}
};

const isMatchingSubmitTokenPayload = (
	payload: NewsletterSubmitTokenPayload,
	options: Pick<NewsletterSubmitTokenPayload, 'action' | 'hostname' | 'mode' | 'origin'>,
): boolean => {
	return (
		payload.action === options.action &&
		payload.hostname === options.hostname &&
		payload.mode === options.mode &&
		payload.origin === options.origin
	);
};

export const createNewsletterSession = async (
	env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>,
	options: {
		action: NewsletterSessionAction;
		hostname: string;
		mode: NewsletterMode;
		origin: string;
	},
): Promise<{ expiresAt: number; submitToken: string }> => {
	const createdAt = Date.now();
	const expiresAt = createdAt + NEWSLETTER_SESSION_TTL_SECONDS * 1000;

	return {
		expiresAt,
		submitToken: await createSubmitToken(env, {
			action: options.action,
			created_at: createdAt,
			expires_at: expiresAt,
			hostname: options.hostname,
			mode: options.mode,
			origin: options.origin,
			v: 1,
		}),
	};
};

export const validateNewsletterSession = async (
	env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>,
	options: {
		action: NewsletterSessionAction;
		hostname: string;
		mode: NewsletterMode;
		origin: string;
		submitToken: string;
	},
): Promise<Result<NewsletterSubmitTokenPayload, 'INVALID_SESSION'>> => {
	const parsedToken = parseSubmitToken(options.submitToken);
	if (!parsedToken.success) {
		return parsedToken;
	}

	const expectedSignature = await signSubmitToken(env, parsedToken.value.encodedPayload);
	if (!timingSafeEqualStrings(parsedToken.value.signature, expectedSignature)) {
		return Err('INVALID_SESSION');
	}

	if (isTimeExpired(parsedToken.value.payload.expires_at)) {
		return Err('INVALID_SESSION');
	}

	if (!isMatchingSubmitTokenPayload(parsedToken.value.payload, options)) {
		return Err('INVALID_SESSION');
	}

	return OK(parsedToken.value.payload);
};
