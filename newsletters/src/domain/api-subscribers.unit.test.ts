import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import * as hostnameConfigs from '../db/hostname-config-records';
import * as subscriptionRecords from '../db/subscription-records';
import { deleteApiSubscriber, listApiSubscribers } from './api-subscribers';

vi.mock('../db/hostname-config-records', () => ({
	getHostnameConfigByHostname: vi.fn(),
}));

vi.mock('../db/subscription-records', () => ({
	deleteSubscriptionRecordById: vi.fn(),
	getSubscriptionRecordById: vi.fn(),
	listSubscriptionRecordsByHostname: vi.fn(),
}));

const env = {
	NewslettersD1: {},
} as Env;

const hostnameConfig = {
	hostname: 'softwarepatterns.com',
	jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
	turnstile_site_key: 'site-key',
};

beforeEach(() => {
	vi.resetAllMocks();
});

describe('listApiSubscribers', () => {
	it('fails for unknown hostnames', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(null);

		const result = await listApiSubscribers(env, {
			hostname: 'unknown.example',
		});

		expect(result).toEqual({
			error: 'UNKNOWN_HOSTNAME',
			success: false,
		});
	});

	it('returns hostname-scoped subscribers', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(hostnameConfig);
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
			list_name: 'weekly',
		});

		expect(result).toEqual({
			success: true,
			value: [
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
			],
		});
		expect(subscriptionRecords.listSubscriptionRecordsByHostname).toHaveBeenCalledWith(env.NewslettersD1, {
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});
	});
});

describe('deleteApiSubscriber', () => {
	it('fails for unknown hostnames', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(null);

		const result = await deleteApiSubscriber(env, {
			hostname: 'unknown.example',
			id: 'sub-1',
		});

		expect(result).toEqual({
			error: 'UNKNOWN_HOSTNAME',
			success: false,
		});
	});

	it('fails when the record is missing', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(hostnameConfig);
		vi.mocked(subscriptionRecords.getSubscriptionRecordById).mockResolvedValue(null);

		const result = await deleteApiSubscriber(env, {
			hostname: 'softwarepatterns.com',
			id: 'sub-1',
		});

		expect(result).toEqual({
			error: 'NOT_FOUND',
			success: false,
		});
	});

	it('fails when the record belongs to another hostname', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(hostnameConfig);
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

		expect(result).toEqual({
			error: 'NOT_FOUND',
			success: false,
		});
	});

	it('deletes a matching record', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(hostnameConfig);
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

		expect(result).toEqual({
			success: true,
			value: 'DELETED',
		});
		expect(subscriptionRecords.deleteSubscriptionRecordById).toHaveBeenCalledWith(env.NewslettersD1, 'sub-1');
	});
});
