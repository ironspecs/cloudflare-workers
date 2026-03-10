import { describe, expect, it } from 'vitest';
import { object, string } from 'valibot';
import { parseRequest } from './requests';

const schema = object({
	query: object({
		list_name: string(),
	}),
	body: object({
		email: string(),
	}),
});

describe('parseRequest', () => {
	it('parses JSON requests', async () => {
		const result = await parseRequest(
			new Request('https://service.example/subscribe?list_name=weekly', {
				body: JSON.stringify({ email: 'person@example.com' }),
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
				method: 'POST',
			}),
			schema,
		);

		expect(result).toEqual({
			success: true,
			value: {
				body: { email: 'person@example.com' },
				query: { list_name: 'weekly' },
			},
		});
	});

	it('parses urlencoded form requests', async () => {
		const result = await parseRequest(
			new Request('https://service.example/subscribe?list_name=weekly', {
				body: new URLSearchParams({ email: 'person@example.com' }),
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				method: 'POST',
			}),
			schema,
		);

		expect(result).toEqual({
			success: true,
			value: {
				body: { email: 'person@example.com' },
				query: { list_name: 'weekly' },
			},
		});
	});

	it('returns INVALID_JSON for malformed JSON', async () => {
		const result = await parseRequest(
			new Request('https://service.example/subscribe?list_name=weekly', {
				body: '{"email"',
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			}),
			schema,
		);

		expect(result).toEqual({
			success: false,
			error: 'INVALID_JSON',
		});
	});

	it('returns validation issues when the schema does not match', async () => {
		const result = await parseRequest(
			new Request('https://service.example/subscribe', {
				body: JSON.stringify({ email: 'person@example.com' }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			}),
			schema,
		);

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected a validation error');
		}

		expect(result.error).toContain('Invalid key: Expected "list_name" but received undefined');
	});
});
