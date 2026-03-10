import type { Env } from '../common';
import { getHostnameConfigByHostname } from '../db/hostname-config-records';
import {
	deleteSubscriptionRecordById,
	getSubscriptionRecordById,
	listSubscriptionRecordsByHostname,
	type SubscriptionRecord,
} from '../db/subscription-records';
import { Err, OK, type Result } from '../lib/results';

export const listApiSubscribers = async (
	env: Env,
	options: {
		hostname: string;
		list_name?: string;
	},
): Promise<Result<SubscriptionRecord[], 'UNKNOWN_HOSTNAME'>> => {
	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, options.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	return OK(
		await listSubscriptionRecordsByHostname(env.NewslettersD1, {
			hostname: options.hostname,
			list_name: options.list_name,
		}),
	);
};

export const deleteApiSubscriber = async (
	env: Env,
	options: {
		hostname: string;
		id: string;
	},
): Promise<Result<'DELETED', 'NOT_FOUND' | 'UNKNOWN_HOSTNAME'>> => {
	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, options.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	const record = await getSubscriptionRecordById(env.NewslettersD1, options.id);
	if (record === null || record.hostname !== options.hostname) {
		return Err('NOT_FOUND');
	}

	await deleteSubscriptionRecordById(env.NewslettersD1, options.id);
	return OK('DELETED');
};
