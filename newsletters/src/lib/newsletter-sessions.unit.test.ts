import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../common';
import {
	createNewsletterSession,
	deleteNewsletterSession,
	NewsletterSessionAction,
	validateNewsletterSession,
} from './newsletter-sessions';

class MemoryKvNamespace {
	private readonly store = new Map<string, string>();

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}

	async get(key: string, type?: 'json' | 'text'): Promise<any> {
		const value = this.store.get(key) ?? null;
		if (value === null) {
			return null;
		}

		if (type === 'json') {
			return JSON.parse(value);
		}

		return value;
	}

	getWithMetadata(): Promise<any> {
		throw new Error('Not implemented in test');
	}

	list(): Promise<any> {
		throw new Error('Not implemented in test');
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
	}
}

let env: Env;

beforeEach(() => {
	env = {
		NewsletterSessionsKV: new MemoryKvNamespace(),
	} as unknown as Env;
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
			csrfToken: createdSession.csrfToken,
			hostname: 'example.com',
			origin: 'https://example.com',
			sessionId: createdSession.sessionId,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error('Expected a valid session');
		}

		expect(result.value.hostname).toBe('example.com');
		expect(result.value.origin).toBe('https://example.com');
	});

	it('rejects a wrong CSRF token', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Subscribe,
			csrfToken: 'wrong-token',
			hostname: 'example.com',
			origin: 'https://example.com',
			sessionId: createdSession.sessionId,
		});

		expect(result).toEqual({
			success: false,
			error: 'INVALID_SESSION',
		});
	});

	it('deletes a session explicitly', async () => {
		const createdSession = await createNewsletterSession(env, {
			action: NewsletterSessionAction.Unsubscribe,
			hostname: 'example.com',
			origin: 'https://example.com',
		});

		await deleteNewsletterSession(env, createdSession.sessionId);

		const result = await validateNewsletterSession(env, {
			action: NewsletterSessionAction.Unsubscribe,
			csrfToken: createdSession.csrfToken,
			hostname: 'example.com',
			origin: 'https://example.com',
			sessionId: createdSession.sessionId,
		});

		expect(result).toEqual({
			success: false,
			error: 'INVALID_SESSION',
		});
	});
});
