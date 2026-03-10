import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import { createCorsHeaders, getBrowserRequestContext, getOriginUrl } from './browser';
import * as hostnameConfigs from '../db/hostname-config-records';

vi.mock('../db/hostname-config-records', () => ({
	getHostnameConfigByHostname: vi.fn(),
}));

const env = {
	NewslettersD1: {},
} as Env;

beforeEach(() => {
	vi.resetAllMocks();
});

describe('getOriginUrl', () => {
	it('returns the parsed origin URL', () => {
		const result = getOriginUrl(new Request('https://service.example/newsletters', { headers: { Origin: 'https://example.com' } }));

		expect(result).toEqual({
			success: true,
			value: new URL('https://example.com'),
		});
	});

	it('fails fast when Origin is missing', () => {
		expect(getOriginUrl(new Request('https://service.example/newsletters'))).toEqual({
			success: false,
			error: 'MISSING_ORIGIN',
		});
	});

	it('rejects malformed Origin headers', () => {
		expect(getOriginUrl(new Request('https://service.example/newsletters', { headers: { Origin: '%%%%' } }))).toEqual({
			success: false,
			error: 'INVALID_ORIGIN',
		});
	});
});

describe('createCorsHeaders', () => {
	it('reflects the allowed origin and headers', () => {
		const headers = createCorsHeaders('https://example.com');

		expect(headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
		expect(headers.get('Access-Control-Allow-Headers')).toMatch(/X-Submit-Token/);
		expect(headers.get('Vary')).toBe('Origin');
	});
});

describe('getBrowserRequestContext', () => {
	it('returns a known hostname context', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'example.com',
			turnstile_site_key: 'site-key',
		});

		const result = await getBrowserRequestContext(
			env,
			new Request('https://service.example/newsletters', { headers: { Origin: 'https://example.com' } }),
		);

		expect(result).toEqual({
			success: true,
			value: {
				corsHeaders: expect.any(Headers),
				hostname: 'example.com',
				hostnameConfig: {
					hostname: 'example.com',
					turnstile_site_key: 'site-key',
				},
				origin: 'https://example.com',
			},
		});
	});

	it('rejects hostname mismatches', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'example.com',
			turnstile_site_key: 'site-key',
		});

		const result = await getBrowserRequestContext(
			env,
			new Request('https://service.example/newsletters', { headers: { Origin: 'https://example.com' } }),
			'another.example',
		);

		expect(result).toEqual({
			success: false,
			error: 'INVALID_HOSTNAME',
		});
	});

	it('rejects unknown hostnames', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(null);

		const result = await getBrowserRequestContext(
			env,
			new Request('https://service.example/newsletters', { headers: { Origin: 'https://example.com' } }),
		);

		expect(result).toEqual({
			success: false,
			error: 'UNKNOWN_HOSTNAME',
		});
	});

	it('keeps requiring a real row for localhost', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'localhost',
			turnstile_site_key: null,
		});

		const result = await getBrowserRequestContext(
			env,
			new Request('https://service.example/newsletters', { headers: { Origin: 'http://localhost:4173' } }),
		);

		expect(result).toEqual({
			success: true,
			value: {
				corsHeaders: expect.any(Headers),
				hostname: 'localhost',
				hostnameConfig: {
					hostname: 'localhost',
					turnstile_site_key: null,
				},
				origin: 'http://localhost:4173',
			},
		});
	});
});
