import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import * as hostnameConfigRecords from '../db/hostname-config-records';
import * as hostnameConfigSecretRecords from '../db/hostname-config-secret-records';
import * as hostnameConfigSecrets from './hostname-config-secrets';
import { TURNSTILE_TEST_TOKEN, getTurnstileSiteKey, verifyTurnstileToken } from './turnstile';

vi.mock('../db/hostname-config-records', () => ({
	getHostnameConfigByHostname: vi.fn(),
}));

vi.mock('../db/hostname-config-secret-records', () => ({
	getHostnameConfigSecretsByHostname: vi.fn(),
}));

vi.mock('./hostname-config-secrets', () => ({
	decryptHostnameConfigSecrets: vi.fn(),
}));

const env = {
	HOSTNAME_CONFIG_KEKS_JSON: JSON.stringify({
		active_id: 'kek202603101900',
		keys: {
			kek202603101900: 'QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
		},
	}),
	NewslettersD1: {},
} as unknown as Env;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

beforeEach(() => {
	vi.resetAllMocks();
});

describe('getTurnstileSiteKey', () => {
	it('returns the hostname site key', async () => {
		vi.mocked(hostnameConfigRecords.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'example.com',
			turnstile_site_key: 'site-key',
		});

		await expect(getTurnstileSiteKey(env, 'example.com')).resolves.toBe('site-key');
	});

	it('returns null when the hostname is not configured', async () => {
		vi.mocked(hostnameConfigRecords.getHostnameConfigByHostname).mockResolvedValue(null);

		await expect(getTurnstileSiteKey(env, 'unknown.example')).resolves.toBeNull();
	});
});

describe('verifyTurnstileToken', () => {
	it('fails when the hostname has no configured secret row', async () => {
		vi.mocked(hostnameConfigSecretRecords.getHostnameConfigSecretsByHostname).mockResolvedValue(null);

		const result = await verifyTurnstileToken(env, new Request('https://service.example/subscribe'), 'example.com', TURNSTILE_TEST_TOKEN);

		expect(result).toEqual({
			success: false,
			error: 'TURNSTILE_NOT_CONFIGURED',
		});
	});

	it('fails when the token is missing', async () => {
		vi.mocked(hostnameConfigSecretRecords.getHostnameConfigSecretsByHostname).mockResolvedValue({
			dek_kek_id: 'kek202603101900',
			dek_wrapped: 'wrapped',
			hostname: 'example.com',
			turnstile_secret_key_ciphertext: 'ciphertext',
		});
		vi.mocked(hostnameConfigSecrets.decryptHostnameConfigSecrets).mockResolvedValue({
			turnstile_secret_key: 'secret-key',
		});

		const result = await verifyTurnstileToken(env, new Request('https://service.example/subscribe'), 'example.com', '');

		expect(result).toEqual({
			success: false,
			error: 'INVALID_TURNSTILE',
		});
	});

	it('accepts a successful verification response', async () => {
		vi.mocked(hostnameConfigSecretRecords.getHostnameConfigSecretsByHostname).mockResolvedValue({
			dek_kek_id: 'kek202603101900',
			dek_wrapped: 'wrapped',
			hostname: 'example.com',
			turnstile_secret_key_ciphertext: 'ciphertext',
		});
		vi.mocked(hostnameConfigSecrets.decryptHostnameConfigSecrets).mockResolvedValue({
			turnstile_secret_key: 'secret-key',
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ hostname: 'localhost', success: true }), {
					headers: { 'Content-Type': 'application/json' },
					status: 200,
				}),
			),
		);

		const result = await verifyTurnstileToken(env, new Request('https://service.example/subscribe'), 'example.com', TURNSTILE_TEST_TOKEN);

		expect(result).toEqual({
			success: true,
			value: 'TURNSTILE_OK',
		});
	});

	it('rejects a hostname mismatch from Siteverify', async () => {
		vi.mocked(hostnameConfigSecretRecords.getHostnameConfigSecretsByHostname).mockResolvedValue({
			dek_kek_id: 'kek202603101900',
			dek_wrapped: 'wrapped',
			hostname: 'example.com',
			turnstile_secret_key_ciphertext: 'ciphertext',
		});
		vi.mocked(hostnameConfigSecrets.decryptHostnameConfigSecrets).mockResolvedValue({
			turnstile_secret_key: 'secret-key',
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ hostname: 'other.example', success: true }), {
					headers: { 'Content-Type': 'application/json' },
					status: 200,
				}),
			),
		);

		const result = await verifyTurnstileToken(env, new Request('https://service.example/subscribe'), 'example.com', TURNSTILE_TEST_TOKEN);

		expect(result).toEqual({
			success: false,
			error: 'INVALID_TURNSTILE',
		});
	});
});
