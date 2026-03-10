import { generateId } from '../lib/crypto';
import {
	SubscriptionTokenType,
	SubscriptionTokenRecord,
	deleteSubscriptionTokenRecordByToken,
	getSubscriptionTokenRecordByToken,
	getSubscriptionTokenRecordBySubscriptionId,
	insertSubscriptionTokenRecord,
} from '../db/subscription-token-records';
import { Env, TOKEN_EXPIRES_IN, isTimeExpired } from '../common';
import { Result, OK, Err } from '../lib/results';

/**
 * If the user already has a token that is not expired, reuse it, otherwise generate a new one.
 */
export const generateAuthToken = async (
	env: Env,
	tokenType: SubscriptionTokenType,
	subscription_id: string,
): Promise<Result<string, 'EXISTING_UNEXPIRED_TOKEN'>> => {
	const tokenRecords = await getSubscriptionTokenRecordBySubscriptionId(env.NewslettersD1, tokenType, subscription_id);

	if (tokenRecords.length > 0) {
		const existingUnexpiredToken = tokenRecords.find((token) => !isTimeExpired(token.expires_at - TOKEN_EXPIRES_IN / 2));

		// Prevent generating new tokens if they already have a token that was recently generated.
		if (existingUnexpiredToken) {
			return Err('EXISTING_UNEXPIRED_TOKEN');
		}

		// Overwise, delete all previous tokens of same type because we're going to give them a new one.
		// This is to prevent the user from having multiple tokens of the same type.
		for (const existingToken of tokenRecords) {
			await deleteSubscriptionTokenRecordByToken(env.NewslettersD1, existingToken.id);
		}
	}

	const token = generateId(63);
	await insertSubscriptionTokenRecord(env.NewslettersD1, {
		id: token,
		expires_at: Date.now() + TOKEN_EXPIRES_IN,
		token_type: tokenType,
		subscription_id,
	});
	return OK(token);
};

/**
 * Given a token, return the user id it is associated with. The token can never be used again. Returns null
 * if the token is invalid or expired.
 */
export const consumeAuthToken = async (
	env: Env,
	token: string,
): Promise<Result<SubscriptionTokenRecord, 'TOKEN_NOT_FOUND' | 'TOKEN_EXPIRED'>> => {
	const record = await getSubscriptionTokenRecordByToken(env.NewslettersD1, token);

	if (!record) {
		return Err('TOKEN_NOT_FOUND');
	}

	// Delete token after used.
	await deleteSubscriptionTokenRecordByToken(env.NewslettersD1, token);

	if (isTimeExpired(record.expires_at)) {
		return Err('TOKEN_EXPIRED');
	}
	return OK(record);
};
