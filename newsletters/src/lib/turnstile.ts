import type { Env } from '../common';
import { getHostnameConfigByHostname } from '../db/hostname-config-records';
import { getHostnameConfigSecretsByHostname } from '../db/hostname-config-secret-records';
import { decryptHostnameConfigSecrets } from './hostname-config-secrets';
import {
	TURNSTILE_TEST_SECRET_KEY,
	TURNSTILE_TEST_SITE_KEY,
	isAcceptedTurnstileHostname,
	isLocalDevelopmentHostname,
} from './hostname-policy';
import { Err, OK, type Result } from './results';

type TurnstileVerifyResponse = {
	'error-codes'?: string[];
	hostname?: string;
	success: boolean;
};

export const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const getTurnstileSecretKey = async (env: Env, hostname: string) => {
	if (isLocalDevelopmentHostname(hostname)) {
		return TURNSTILE_TEST_SECRET_KEY;
	}

	const secretsRecord = await getHostnameConfigSecretsByHostname(env.NewslettersD1, hostname);
	if (secretsRecord === null) {
		return null;
	}

	const secrets = await decryptHostnameConfigSecrets(env, secretsRecord);
	return secrets.turnstile_secret_key;
};

export const getTurnstileSiteKey = async (env: Env, hostname: string): Promise<string | null> => {
	if (isLocalDevelopmentHostname(hostname)) {
		return TURNSTILE_TEST_SITE_KEY;
	}

	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, hostname);
	return hostnameConfig?.turnstile_site_key ?? null;
};

export const verifyTurnstileToken = async (
	env: Env,
	request: Request,
	hostname: string,
	token: string,
): Promise<Result<'TURNSTILE_OK', 'INVALID_TURNSTILE' | 'TURNSTILE_NOT_CONFIGURED'>> => {
	const secretKey = await getTurnstileSecretKey(env, hostname);
	if (!secretKey) {
		return Err('TURNSTILE_NOT_CONFIGURED');
	}

	if (!token) {
		return Err('INVALID_TURNSTILE');
	}

	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		body: JSON.stringify({
			idempotency_key: crypto.randomUUID(),
			remoteip: request.headers.get('cf-connecting-ip') ?? undefined,
			response: token,
			secret: secretKey,
		}),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	});

	if (!response.ok) {
		return Err('INVALID_TURNSTILE');
	}

	const payload = (await response.json()) as TurnstileVerifyResponse;
	if (!payload.success) {
		return Err('INVALID_TURNSTILE');
	}

	if (payload.hostname && !isAcceptedTurnstileHostname(hostname, payload.hostname)) {
		return Err('INVALID_TURNSTILE');
	}

	return OK('TURNSTILE_OK');
};
