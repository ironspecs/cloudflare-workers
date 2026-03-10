import type { D1Database } from '@cloudflare/workers-types';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/drizzle';
import { subscription_token } from './schema';

export const enum SubscriptionTokenType {
	VerifyEmail = 'verify_email',
}

export type SubscriptionTokenRecord = {
	id: string;
	expires_at: number;
	subscription_id: string;
	token_type: SubscriptionTokenType;
};

type SubscriptionTokenRow = typeof subscription_token.$inferSelect;

const toSubscriptionTokenRecord = (row: SubscriptionTokenRow): SubscriptionTokenRecord => {
	return {
		...row,
		token_type: row.token_type as SubscriptionTokenType,
	};
};

export const insertSubscriptionTokenRecord = async (db: D1Database, record: SubscriptionTokenRecord): Promise<void> => {
	await getDb(db).insert(subscription_token).values(record);
};

export const deleteSubscriptionTokenRecordByToken = async (db: D1Database, token: string): Promise<void> => {
	await getDb(db).delete(subscription_token).where(eq(subscription_token.id, token));
};

export const getSubscriptionTokenRecordByToken = async (db: D1Database, token: string): Promise<SubscriptionTokenRecord | null> => {
	const records = await getDb(db).select().from(subscription_token).where(eq(subscription_token.id, token)).limit(1);
	return records[0] ? toSubscriptionTokenRecord(records[0]) : null;
};

export const getSubscriptionTokenRecordBySubscriptionId = async (
	db: D1Database,
	token_type: SubscriptionTokenType,
	subscription_id: string,
): Promise<SubscriptionTokenRecord[]> => {
	const records = await getDb(db)
		.select()
		.from(subscription_token)
		.where(and(eq(subscription_token.subscription_id, subscription_id), eq(subscription_token.token_type, token_type)));
	return records.map(toSubscriptionTokenRecord);
};
