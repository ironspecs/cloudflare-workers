import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import * as subscriptionRecords from '../db/subscription-records';
import { deleteApiSubscriber, listApiSubscribers } from './api-subscribers';

vi.mock('../db/subscription-records', () => ({
	deleteSubscriptionRecordById: vi.fn(),
	getSubscriptionRecordById: vi.fn(),
	listSubscriptionRecordsByHostname: vi.fn(),
}));

const env = {
	NewslettersD1: {},
} as Env;

beforeEach(() => {
	vi.resetAllMocks();
});

describe('listApiSubscribers', () => {
	it('returns hostname-scoped subscribers', async () => {
		vi.mocked(subscriptionRecords.listSubscriptionRecordsByHostname).mockResolvedValue([
			{
				created_at: new Date('2026-03-10T15:00:00Z'),
				email: 'person@softwarepatterns.com',
				email_confirmed_at: null,
				hostname: 'softwarepatterns.com',
				id: 'sub-1',
				list_name: 'weekly',
				person_name: 'Person',
				unsubscribed_at: null,
			},
		]);

		const result = await listApiSubscribers(env, {
			hostname: 'softwarepatterns.com',
			limit: 100,
			list_name: 'weekly',
			offset: 0,
		});

		expect(result).toEqual([
			{
				created_at: new Date('2026-03-10T15:00:00Z'),
				email: 'person@softwarepatterns.com',
				email_confirmed_at: null,
				hostname: 'softwarepatterns.com',
				id: 'sub-1',
				list_name: 'weekly',
				person_name: 'Person',
				unsubscribed_at: null,
			},
		]);
		expect(subscriptionRecords.listSubscriptionRecordsByHostname).toHaveBeenCalledWith(env.NewslettersD1, {
			hostname: 'softwarepatterns.com',
			limit: 100,
			list_name: 'weekly',
			offset: 0,
		});
	});
});

describe('deleteApiSubscriber', () => {
	it('fails when the record is missing', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordById).mockResolvedValue(null);

		const result = await deleteApiSubscriber(env, {
			hostname: 'softwarepatterns.com',
			id: 'sub-1',
		});

		expect(result).toEqual({ code: 'NOT_FOUND' });
	});

	it('fails when the record belongs to another hostname', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordById).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'other.example',
			id: 'sub-1',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: null,
		});

		const result = await deleteApiSubscriber(env, {
			hostname: 'softwarepatterns.com',
			id: 'sub-1',
		});

		expect(result).toEqual({ code: 'NOT_FOUND' });
	});

	it('deletes a matching record', async () => {
		vi.mocked(subscriptionRecords.getSubscriptionRecordById).mockResolvedValue({
			created_at: new Date('2026-03-10T15:00:00Z'),
			email: 'person@softwarepatterns.com',
			email_confirmed_at: null,
			hostname: 'softwarepatterns.com',
			id: 'sub-1',
			list_name: 'weekly',
			person_name: null,
			unsubscribed_at: null,
		});

		const result = await deleteApiSubscriber(env, {
			hostname: 'softwarepatterns.com',
			id: 'sub-1',
		});

		expect(result).toEqual({ code: 'DELETED' });
		expect(subscriptionRecords.deleteSubscriptionRecordById).toHaveBeenCalledWith(env.NewslettersD1, 'sub-1');
	});
});
