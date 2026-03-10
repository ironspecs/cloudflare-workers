import type { Env } from '../common';
import { NEWSLETTER_SESSION_TTL_SECONDS, isTimeExpired } from '../common';
import { generateId, sha256Hex } from './crypto';
import { Err, OK, type Result } from './results';

export const enum NewsletterSessionAction {
	Subscribe = 'subscribe',
	Unsubscribe = 'unsubscribe',
}

export type NewsletterSessionRecord = {
	action: NewsletterSessionAction;
	created_at: number;
	csrf_token_hash: string;
	expires_at: number;
	hostname: string;
	origin: string;
};

const createSessionKey = (sessionId: string) => `newsletter-session:${sessionId}`;
const getSessionKey = (sessionId: string) => createSessionKey(sessionId);

export const createNewsletterSession = async (
	env: Env,
	options: {
		action: NewsletterSessionAction;
		hostname: string;
		origin: string;
	},
): Promise<{ csrfToken: string; expiresAt: number; sessionId: string }> => {
	const csrfToken = generateId(63);
	const createdAt = Date.now();
	const expiresAt = createdAt + NEWSLETTER_SESSION_TTL_SECONDS * 1000;
	const sessionId = generateId(32);
	const record: NewsletterSessionRecord = {
		action: options.action,
		created_at: createdAt,
		csrf_token_hash: await sha256Hex(csrfToken),
		expires_at: expiresAt,
		hostname: options.hostname,
		origin: options.origin,
	};

	await env.NewsletterSessionsKV.put(createSessionKey(sessionId), JSON.stringify(record), {
		expirationTtl: NEWSLETTER_SESSION_TTL_SECONDS,
	});

	return { csrfToken, expiresAt, sessionId };
};

export const validateNewsletterSession = async (
	env: Env,
	options: {
		action: NewsletterSessionAction;
		csrfToken: string;
		hostname: string;
		origin: string;
		sessionId: string;
	},
): Promise<Result<NewsletterSessionRecord, 'INVALID_SESSION'>> => {
	const record = await env.NewsletterSessionsKV.get<NewsletterSessionRecord>(createSessionKey(options.sessionId), 'json');
	if (!record || isTimeExpired(record.expires_at)) {
		return Err('INVALID_SESSION');
	}

	if (record.action !== options.action || record.hostname !== options.hostname || record.origin !== options.origin) {
		return Err('INVALID_SESSION');
	}

	if (record.csrf_token_hash !== (await sha256Hex(options.csrfToken))) {
		return Err('INVALID_SESSION');
	}

	return OK(record);
};

export const deleteNewsletterSession = async (env: Env, sessionId: string): Promise<void> => {
	await env.NewsletterSessionsKV.delete(getSessionKey(sessionId));
};

export const consumeNewsletterSession = async (
	env: Env,
	options: {
		action: NewsletterSessionAction;
		csrfToken: string;
		hostname: string;
		origin: string;
		sessionId: string;
	},
): Promise<Result<NewsletterSessionRecord, 'INVALID_SESSION'>> => {
	const record = await validateNewsletterSession(env, options);
	if (!record.success) {
		return record;
	}

	await deleteNewsletterSession(env, options.sessionId);
	return record;
};
