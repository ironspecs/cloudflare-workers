import type { Env } from '../common';
import { deleteSubscriptionRecordById, getSubscriptionRecordById, listSubscriptionRecordsByHostname } from '../db/subscription-records';

export const listSubscribers = async (
	env: Env,
	options: {
		hostname: string;
		limit: number;
		list_name?: string;
		offset: number;
	},
) => {
	return listSubscriptionRecordsByHostname(env.NewslettersD1, {
		hostname: options.hostname,
		limit: options.limit,
		list_name: options.list_name,
		offset: options.offset,
	});
};

export const deleteSubscriber = async (
	env: Env,
	options: {
		hostname: string;
		id: string;
	},
) => {
	const record = await getSubscriptionRecordById(env.NewslettersD1, options.id);
	if (record === null || record.hostname !== options.hostname) {
		return { code: 'NOT_FOUND' as const };
	}

	await deleteSubscriptionRecordById(env.NewslettersD1, options.id);
	return { code: 'DELETED' as const };
};
