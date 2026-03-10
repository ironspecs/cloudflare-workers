import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import { createNewsletterSession, NewsletterSessionAction, validateNewsletterSession } from './newsletter-sessions';

let env: Env;

beforeEach(() => {
	env = {
		HOSTNAME_CONFIG_KEKS_JSON: JSON.stringify({
			active_id: 'kek202603101900',
			keys: {
				kek202603101900: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
			},
		}),
	} as unknown as Env;
	vi.useRealTimers();
});

describe('newsletter sessions', () => {
	it('creates and validates a session', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
			submitToken: createdSession.submitToken,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error('Expected a valid session');
		}

		expect(result.value).toMatchObject({
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
			v: 1,
		});
	});

	it('rejects a tampered submit token', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
			submitToken: `${createdSession.submitToken}broken`,
		});

		expect(result).toEqual({
			success: false,
			error: 'INVALID_SESSION',
		});
	});

	it('rejects expired submit tokens', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'));

		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Unsubscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		vi.advanceTimersByTime(10 * 60 * 1000 + 1);

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Unsubscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
			submitToken: createdSession.submitToken,
		});

		expect(result).toEqual({
			success: false,
			error: 'INVALID_SESSION',
		});
	});

	it('rejects hostname mismatches', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'softwarepatterns.com',
			origin: 'https://example.com',
			submitToken: createdSession.submitToken,
		});

		expect(result).toEqual({
			success: false,
			error: 'INVALID_SESSION',
		});
	});

	it('accepts token reuse while the token remains valid', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		await expect(
			validateNewsletterSession(env, {
				action: NewsletterSessionAction.Subscribe,
				hostname: 'example.com',
				origin: 'https://example.com',
				submitToken: createdSession.submitToken,
			}),
		).resolves.toMatchObject({ success: true });
		await expect(
			validateNewsletterSession(env, {
				action: NewsletterSessionAction.Subscribe,
				hostname: 'example.com',
				origin: 'https://example.com',
				submitToken: createdSession.submitToken,
			}),
		).resolves.toMatchObject({ success: true });
	});
});
