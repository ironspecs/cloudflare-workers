import type { Env } from '../common';
import {
	deleteSubscriptionRecordById,
	getSubscriptionRecordById,
	listSubscriptionRecordsByHostname,
	type SubscriptionRecord,
} from '../db/subscription-records';

export type DeleteApiSubscriberOutcome = { code: 'DELETED' } | { code: 'NOT_FOUND' };

export const listApiSubscribers = async (
	env: Env,
	options: {
		hostname: string;
		limit: number;
		list_name?: string;
		offset: number;
	},
): Promise<SubscriptionRecord[]> => {
	return listSubscriptionRecordsByHostname(env.NewslettersD1, {
		hostname: options.hostname,
		limit: options.limit,
		list_name: options.list_name,
		offset: options.offset,
	});
};

export const deleteApiSubscriber = async (
	env: Env,
	options: {
		hostname: string;
		id: string;
	},
): Promise<DeleteApiSubscriberOutcome> => {
	const record = await getSubscriptionRecordById(env.NewslettersD1, options.id);
	if (record === null || record.hostname !== options.hostname) {
		return { code: 'NOT_FOUND' };
	}

	await deleteSubscriptionRecordById(env.NewslettersD1, options.id);
	return { code: 'DELETED' };
};
