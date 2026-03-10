import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import * as subscriptionRecords from '../db/subscription-records';
import * as crypto from '../lib/crypto';
import { subscribe, unsubscribe } from './subscriptions';

vi.mock('../db/subscription-records', () => ({
	getSubscriptionRecordByUniqueValues: vi.fn(),
	insertSubscriptionRecord: vi.fn(),
	setSubscriptionRecordEmailConfirmedAt: vi.fn(),
	setSubscriptionRecordUnsubscribedAt: vi.fn(),
}));

vi.mock('../lib/crypto', () => ({
	generateId: vi.fn(),
}));

const env = {
	NewslettersD1: {},
} as Env;

beforeEach(() => {
	vi.resetAllMocks();
});

describe('subscribe', () => {
	it('does not sink real mailbox-provider email domains', async () => {
		vi.mocked(crypto.generateId).mockReturnValue('gmail-id');

		const result = await subscribe(env, {
			email: 'person@gmail.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'SUBSCRIBED' });
		expect(subscriptionRecords.insertSubscriptionRecord).toHaveBeenCalledWith(env.NewslettersD1, {
			email: 'person@gmail.com',
			hostname: 'softwarepatterns.com',
			id: 'gmail-id',
			list_name: 'weekly',
		});
	});

	it('sinks reserved test email domains without writing them', async () => {
		const result = await subscribe(env, {
			email: 'person@example.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'SINK_ACCEPTED' });
		expect(subscriptionRecords.insertSubscriptionRecord).not.toHaveBeenCalled();
	});

	it('writes live subscriptions', async () => {
		vi.mocked(crypto.generateId).mockReturnValue('generated-id');

		const result = await subscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
			person_name: 'Person',
		});

		expect(result).toEqual({ code: 'SUBSCRIBED' });
		expect(subscriptionRecords.insertSubscriptionRecord).toHaveBeenCalledWith(env.NewslettersD1, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			id: 'generated-id',
			list_name: 'weekly',
			person_name: 'Person',
		});
	});

	it('returns RESUBSCRIBED when the existing record was unsubscribed', async () => {
		vi.mocked(crypto.generateId).mockReturnValue('generated-id');
		vi.mocked(subscriptionRecords.insertSubscriptionRecord).mockRejectedValue(
			new Error('D1_ERROR: UNIQUE constraint failed: subscription.email, subscription.hostname, subscription.list_name'),
		);
		vi.mocked(subscriptionRecords.getSubscriptionRecordByUniqueValues).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'softwarepatterns.com',
			id: 'existing-id',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: new Date('2026-03-10T16:00:00Z'),
		});

		const result = await subscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'RESUBSCRIBED' });
		expect(subscriptionRecords.setSubscriptionRecordUnsubscribedAt).toHaveBeenCalledWith(env.NewslettersD1, {
			id: 'existing-id',
			unsubscribed_at: null,
		});
	});

	it('returns ALREADY_SUBSCRIBED when the existing record is active', async () => {
		vi.mocked(crypto.generateId).mockReturnValue('generated-id');
		vi.mocked(subscriptionRecords.insertSubscriptionRecord).mockRejectedValue(
			new Error('D1_ERROR: UNIQUE constraint failed: subscription.email, subscription.hostname, subscription.list_name'),
		);
		vi.mocked(subscriptionRecords.getSubscriptionRecordByUniqueValues).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'softwarepatterns.com',
			id: 'existing-id',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: null,
		});

		const result = await subscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'ALREADY_SUBSCRIBED' });
	});
});

describe('unsubscribe', () => {
	it('returns NOT_FOUND when the record does not exist', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordByUniqueValues).mockResolvedValue(null);

		const result = await unsubscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'NOT_FOUND' });
	});

	it('returns ALREADY_UNSUBSCRIBED when the record is already inactive', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordByUniqueValues).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'softwarepatterns.com',
			id: 'existing-id',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: new Date('2026-03-10T16:00:00Z'),
		});

		const result = await unsubscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'ALREADY_UNSUBSCRIBED' });
	});

	it('returns UNSUBSCRIBED and updates the record when active', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordByUniqueValues).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'softwarepatterns.com',
			id: 'existing-id',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: null,
		});

		const result = await unsubscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({ code: 'UNSUBSCRIBED' });
		expect(subscriptionRecords.setSubscriptionRecordUnsubscribedAt).toHaveBeenCalledTimes(1);
	});
});
