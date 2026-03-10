import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../common';
import * as hostnameConfigs from '../db/hostname-config-records';
import * as subscriptionRecords from '../db/subscription-records';
import * as crypto from '../lib/crypto';
import { subscribe, unsubscribe } from './subscriptions';

vi.mock('../db/hostname-config-records', () => ({
	getHostnameConfigByHostname: vi.fn(),
}));

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

const liveHostnameConfig = {
	hostname: 'softwarepatterns.com',
	jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
	turnstile_site_key: 'site-key',
};

beforeEach(() => {
	vi.resetAllMocks();
});

describe('subscribe', () => {
	it('sinks localhost subscriptions without writing them', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'localhost',
			jwks_url: null,
			turnstile_site_key: null,
		});

		const result = await subscribe(env, {
			email: 'person@example.com',
			hostname: 'localhost',
			list_name: 'weekly',
		});

		expect(result).toEqual({
			success: true,
			value: 'SINK_ACCEPTED',
		});
		expect(subscriptionRecords.insertSubscriptionRecord).not.toHaveBeenCalled();
	});

	it('does not sink real mailbox-provider email domains', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: 'softwarepatterns.com',
			jwks_url: 'https://auth.inbox-manager.com/.well-known/jwks.json',
			turnstile_site_key: 'site-key',
		});
		vi.mocked(crypto.generateId).mockReturnValue('gmail-id');

		const result = await subscribe(env, {
			email: 'person@gmail.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({
			success: true,
			value: 'SUBSCRIBED',
		});
		expect(subscriptionRecords.insertSubscriptionRecord).toHaveBeenCalledWith(env.NewslettersD1, {
			email: 'person@gmail.com',
			hostname: 'softwarepatterns.com',
			id: 'gmail-id',
			list_name: 'weekly',
		});
	});

	it('sinks reserved test email domains without writing them', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(liveHostnameConfig);

		const result = await subscribe(env, {
			email: 'person@example.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
		});

		expect(result).toEqual({
			success: true,
			value: 'SINK_ACCEPTED',
		});
		expect(subscriptionRecords.insertSubscriptionRecord).not.toHaveBeenCalled();
	});

	it('writes live subscriptions', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue(liveHostnameConfig);
		vi.mocked(crypto.generateId).mockReturnValue('generated-id');

		const result = await subscribe(env, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			list_name: 'weekly',
			person_name: 'Person',
		});

		expect(result).toEqual({
			success: true,
			value: 'SUBSCRIBED',
		});
		expect(subscriptionRecords.insertSubscriptionRecord).toHaveBeenCalledWith(env.NewslettersD1, {
			email: 'person@softwarepatterns.com',
			hostname: 'softwarepatterns.com',
			id: 'generated-id',
			list_name: 'weekly',
			person_name: 'Person',
		});
	});
});

describe('unsubscribe', () => {
	it('sinks localhost unsubscribe requests without reading subscriptions', async () => {
		vi.mocked(hostnameConfigs.getHostnameConfigByHostname).mockResolvedValue({
			hostname: '127.0.0.1',
			jwks_url: null,
			turnstile_site_key: null,
		});

		const result = await unsubscribe(env, {
			email: 'person@example.com',
			hostname: '127.0.0.1',
			list_name: 'weekly',
		});

		expect(result).toEqual({
			success: true,
			value: 'SINK_ACCEPTED',
		});
		expect(subscriptionRecords.getSubscriptionRecordByUniqueValues).not.toHaveBeenCalled();
		expect(subscriptionRecords.setSubscriptionRecordUnsubscribedAt).not.toHaveBeenCalled();
	});
});
