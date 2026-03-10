import { describe, expect, it } from 'vitest';
import { applyRateLimit, getRateLimitKey } from './rate-limit';

describe('applyRateLimit', () => {
	it('returns success when the binding allows the request', async () => {
		const result = await applyRateLimit(
			{
				limit: async () => ({ success: true }),
			} as any,
			'example.com:127.0.0.1',
		);

		expect(result).toEqual({
			success: true,
			value: 'RATE_LIMIT_OK',
		});
	});

	it('returns RATE_LIMITED when the binding rejects the request', async () => {
		const result = await applyRateLimit(
			{
				limit: async () => ({ success: false }),
			} as any,
			'example.com:127.0.0.1',
		);

		expect(result).toEqual({
			success: false,
			error: 'RATE_LIMITED',
		});
	});
});

describe('getRateLimitKey', () => {
	it('includes the hostname and Cloudflare client IP', () => {
		const request = new Request('https://service.example/subscribe', {
			headers: {
				'cf-connecting-ip': '203.0.113.10',
			},
		});

		expect(getRateLimitKey(request, 'example.com')).toBe('example.com:203.0.113.10');
	});

	it('falls back to a local key when cf-connecting-ip is absent', () => {
		expect(getRateLimitKey(new Request('https://service.example/subscribe'), 'example.com')).toBe('example.com:local');
	});
});
