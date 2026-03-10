import { Env, Subset, isErrorWithMessage } from '../common';
import { getHostnameConfigByHostname } from '../db/hostname-config-records';
import {
	SubscriptionRecord,
	getSubscriptionRecordByUniqueValues,
	insertSubscriptionRecord,
	setSubscriptionRecordEmailConfirmedAt,
	setSubscriptionRecordUnsubscribedAt,
} from '../db/subscription-records';
import { generateId } from '../lib/crypto';
import { getEmailHostname, isAutomaticSinkEmailHostname } from '../lib/hostname-policy';
import { logError } from '../lib/log';
import { Err, NotImplemented, OK, Result } from '../lib/results';
import { consumeAuthToken } from './subscription-tokens';

export type SubscribeOptions = Subset<
	SubscriptionRecord,
	{
		email: string;
		hostname: string;
		list_name: string;
		person_name?: string | null;
	}
>;

export type SubscribeOutcome =
	| { code: 'ALREADY_SUBSCRIBED' }
	| { code: 'RESUBSCRIBED' }
	| { code: 'SINK_ACCEPTED' }
	| { code: 'SUBSCRIBED' };

export const subscribe = async (env: Env, data: SubscribeOptions): Promise<SubscribeOutcome> => {
	const emailHostname = getEmailHostname(data.email);
	if (isAutomaticSinkEmailHostname(emailHostname)) {
		return { code: 'SINK_ACCEPTED' };
	}

	try {
		await insertSubscriptionRecord(env.NewslettersD1, {
			id: generateId(15),
			...data,
		});
	} catch (e: unknown) {
		logError('newsletter_subscription_insert_failed', e, {
			hostname: data.hostname,
			list_name: data.list_name,
			route: '/subscribe',
		});
		if (!isErrorWithMessage(e)) {
			throw e;
		}

		const record = await getSubscriptionRecordByUniqueValues(env.NewslettersD1, data);
		if (record === null) {
			throw new NotImplemented();
		}

		if (record.unsubscribed_at !== null) {
			await setSubscriptionRecordUnsubscribedAt(env.NewslettersD1, {
				id: record.id,
				unsubscribed_at: null,
			});
			return { code: 'RESUBSCRIBED' };
		}

		return { code: 'ALREADY_SUBSCRIBED' };
	}
	return { code: 'SUBSCRIBED' };
};

export type UnsubscribeOptions = Subset<
	SubscriptionRecord,
	{
		email: string;
		hostname: string;
		list_name: string;
		person_name?: string | null;
	}
>;

export type UnsubscribeOutcome =
	| { code: 'ALREADY_UNSUBSCRIBED' }
	| { code: 'NOT_FOUND' }
	| { code: 'SINK_ACCEPTED' }
	| { code: 'UNSUBSCRIBED' };

export const unsubscribe = async (env: Env, data: UnsubscribeOptions): Promise<UnsubscribeOutcome> => {
	const emailHostname = getEmailHostname(data.email);
	if (isAutomaticSinkEmailHostname(emailHostname)) {
		return { code: 'SINK_ACCEPTED' };
	}

	const record = await getSubscriptionRecordByUniqueValues(env.NewslettersD1, data);
	if (record === null) {
		return { code: 'NOT_FOUND' };
	}

	// If they're already unsubscribed, we don't need to do anything.
	if (record.unsubscribed_at !== null) {
		return { code: 'ALREADY_UNSUBSCRIBED' };
	}

	await setSubscriptionRecordUnsubscribedAt(env.NewslettersD1, {
		id: record.id,
		unsubscribed_at: new Date(),
	});

	return { code: 'UNSUBSCRIBED' };
};

export const confirmEmail = async (
	env: Env,
	data: { token: string; hostname: string },
): Promise<Result<'EMAIL_CONFIRMED', 'TOKEN_NOT_FOUND' | 'TOKEN_EXPIRED' | 'ALREADY_CONFIRMED' | 'UNKNOWN_HOSTNAME'>> => {
	// Get the hostname configuration.
	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, data.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	const tokenResult = await consumeAuthToken(env, data.token);
	if (!tokenResult.success) {
		return Err(tokenResult.error);
	}
	const token = tokenResult.value;

	await setSubscriptionRecordEmailConfirmedAt(env.NewslettersD1, {
		id: token.subscription_id,
		email_confirmed_at: new Date(),
	});

	return OK('EMAIL_CONFIRMED');
};
