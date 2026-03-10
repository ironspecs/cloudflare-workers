import { type KeyObject, createSign, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import { authorizeServiceRequest } from './service-auth';

const testJwksKid = 'unit-test-rs256-key';

const toBase64Url = (value: string) => Buffer.from(value).toString('base64url');

const createSignedJwt = (privateKey: KeyObject, payload: Record<string, unknown>) => {
	const header = {
		alg: 'RS256',
		kid: testJwksKid,
		typ: 'JWT',
	};
	const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
	const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey).toString('base64url');
	return `${signingInput}.${signature}`;
};

const createJwksDocument = () => {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});

	return {
		document: {
			keys: [
				{
					...publicKey.export({ format: 'jwk' }),
					alg: 'RS256',
					kid: testJwksKid,
					use: 'sig',
				},
			],
		},
		privateKey,
	};
};

const createKvNamespace = (): Env['JwksCacheKV'] => {
	const values = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => values.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			values.set(key, value);
		}),
	} as unknown as Env['JwksCacheKV'];
};

describe('authorizeServiceRequest', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('authorizes a valid RS256 JWT and reuses the cached JWKS', async () => {
		const kvNamespace = createKvNamespace();
		const env = {
			JwksCacheKV: kvNamespace,
		} as Pick<Env, 'JwksCacheKV'>;
		const jwks = createJwksDocument();
		const token = createSignedJwt(jwks.privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
			sub: 'newsletter-service',
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(jwks.document), {
				headers: {
					'cache-control': 'public, max-age=120',
					'content-type': 'application/json',
				},
				status: 200,
			}),
		);

		const request = new Request('https://service.example/api/subscribers', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
			method: 'POST',
		});
		const hostnameConfig = {
			hostname: 'softwarepatterns.com',
			jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
			turnstile_site_key: null,
		};

		const firstResult = await authorizeServiceRequest(env, {
			hostnameConfig,
			request,
		});
		const secondResult = await authorizeServiceRequest(env, {
			hostnameConfig,
			request,
		});

		expect(firstResult).toEqual({
			success: true,
			value: {
				payload: expect.objectContaining({
					sub: 'newsletter-service',
				}),
			},
		});
		expect(secondResult).toEqual(firstResult);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(kvNamespace.put).toHaveBeenCalledOnce();
	});

	it('rejects missing bearer tokens', async () => {
		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					method: 'POST',
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_AUTHORIZATION',
			success: false,
		});
	});

	it('rejects hostnames without configured JWKS URLs', async () => {
		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: null,
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: 'Bearer test',
					},
					method: 'POST',
				}),
			},
		);

		expect(result).toEqual({
			error: 'JWT_NOT_CONFIGURED',
			success: false,
		});
	});

	it('rejects expired JWTs before fetching JWKS', async () => {
		const kvNamespace = createKvNamespace();
		const env = {
			JwksCacheKV: kvNamespace,
		} as Pick<Env, 'JwksCacheKV'>;
		const { privateKey } = createJwksDocument();
		const token = createSignedJwt(privateKey, {
			exp: Math.floor(Date.now() / 1000) - 1,
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await authorizeServiceRequest(env, {
			hostnameConfig: {
				hostname: 'softwarepatterns.com',
				jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
				turnstile_site_key: null,
			},
			request: new Request('https://service.example/api/subscribers', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
				method: 'POST',
			}),
		});

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects JWTs that are not yet valid', async () => {
		const { privateKey } = createJwksDocument();
		const token = createSignedJwt(privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
			nbf: Math.floor(Date.now() / 1000) + 300,
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects malformed JWTs', async () => {
		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: 'Bearer malformed',
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
	});

	it('rejects when the JWKS fetch fails', async () => {
		const jwks = createJwksDocument();
		const token = createSignedJwt(jwks.privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
	});

	it('rejects when the JWKS document shape is invalid', async () => {
		const jwks = createJwksDocument();
		const token = createSignedJwt(jwks.privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ nope: true }), {
				status: 200,
			}),
		);

		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
	});

	it('rejects when the JWKS does not contain the matching key', async () => {
		const jwks = createJwksDocument();
		const token = createSignedJwt(jwks.privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					keys: [
						{
							...jwks.document.keys[0],
							kid: 'different-kid',
						},
					],
				}),
				{
					status: 200,
				},
			),
		);

		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
	});

	it('rejects when the signature does not match the configured JWKS', async () => {
		const signingKeys = createJwksDocument();
		const verificationKeys = createJwksDocument();
		const token = createSignedJwt(signingKeys.privateKey, {
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(verificationKeys.document), {
				status: 200,
			}),
		);

		const result = await authorizeServiceRequest(
			{
				JwksCacheKV: createKvNamespace(),
			} as Pick<Env, 'JwksCacheKV'>,
			{
				hostnameConfig: {
					hostname: 'softwarepatterns.com',
					jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
					turnstile_site_key: null,
				},
				request: new Request('https://service.example/api/subscribers', {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}),
			},
		);

		expect(result).toEqual({
			error: 'INVALID_JWT',
			success: false,
		});
	});
});
