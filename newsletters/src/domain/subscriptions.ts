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
import { isUniqueConstraintError } from '../lib/d1';
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

export const subscribe = async (
	env: Env,
	data: SubscribeOptions,
): Promise<Result<'SUBSCRIBED', 'RESUBSCRIBED' | 'ALREADY_SUBSCRIBED' | 'UNKNOWN_HOSTNAME'>> => {
	// Get the hostname configuration.
	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, data.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	try {
		await insertSubscriptionRecord(env.NewslettersD1, {
			id: generateId(15),
			...data,
		});
	} catch (e: unknown) {
		console.error('Error inserting subscription record', e);
		if (isErrorWithMessage(e)) {
			// If the user and hostname combination already exists, we can't subscribe them again.
			if (isUniqueConstraintError(e)) {
				// Get the existing record to see why.
				const record = await getSubscriptionRecordByUniqueValues(env.NewslettersD1, data);
				if (record === null) {
					// ??? This should never happen if we just got a conflict.
					throw new NotImplemented();
				}

				// If they were unsubscribed, allow them to subscribe again.
				if (record.unsubscribed_at !== null) {
					await setSubscriptionRecordUnsubscribedAt(env.NewslettersD1, {
						id: record.id,
						unsubscribed_at: null,
					});
					return Err('RESUBSCRIBED');
				}

				// Otherwise, they're already subscribed.
				return Err('ALREADY_SUBSCRIBED');
			}
		}
		throw e;
	}
	return OK('SUBSCRIBED');
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

export const unsubscribe = async (
	env: Env,
	data: UnsubscribeOptions,
): Promise<Result<'UNSUBSCRIBED', 'ALREADY_UNSUBSCRIBED' | 'UNKNOWN_HOSTNAME' | 'NOT_FOUND'>> => {
	// Get the hostname configuration.
	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, data.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	const record = await getSubscriptionRecordByUniqueValues(env.NewslettersD1, data);
	if (record === null) {
		return Err('NOT_FOUND');
	}

	// If they're already unsubscribed, we don't need to do anything.
	if (record.unsubscribed_at !== null) {
		return Err('ALREADY_UNSUBSCRIBED');
	}

	await setSubscriptionRecordUnsubscribedAt(env.NewslettersD1, {
		id: record.id,
		unsubscribed_at: new Date(),
	});

	return OK('UNSUBSCRIBED');
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
