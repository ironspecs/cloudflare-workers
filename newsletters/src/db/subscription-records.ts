import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq } from 'drizzle-orm';
import { Subset } from '../common';
import { getDb } from '../lib/drizzle';
import { subscription } from './schema';

export type SubscriptionRecord = {
	id: string;
	email: string;
	hostname: string;
	/** Use empty string instead of null because NULL does not enforce uniqueness. */
	list_name: string;
	person_name: string | null;
	created_at: Date | null;
	email_confirmed_at: Date | null;
	unsubscribed_at: Date | null;
};

export type InsertSubscriptionOptions = Subset<
	SubscriptionRecord,
	{
		id: string;
		email: string;
		hostname: string;
		list_name: string;
		person_name?: string | null;
	}
>;

type SubscriptionRow = typeof subscription.$inferSelect;

const fromNullableTimestamp = (value: number | null): Date | null => {
	return value === null ? null : new Date(value);
};

const toSubscriptionRecord = (row: SubscriptionRow): SubscriptionRecord => {
	return {
		...row,
		created_at: fromNullableTimestamp(row.created_at),
		email_confirmed_at: fromNullableTimestamp(row.email_confirmed_at),
		unsubscribed_at: fromNullableTimestamp(row.unsubscribed_at),
	};
};

export const getSubscriptionRecordById = async (db: D1Database, id: string): Promise<SubscriptionRecord | null> => {
	const records = await getDb(db).select().from(subscription).where(eq(subscription.id, id)).limit(1);
	return records[0] ? toSubscriptionRecord(records[0]) : null;
};

export const listSubscriptionRecordsByHostname = async (
	db: D1Database,
	options: {
		hostname: string;
		list_name?: string;
	},
): Promise<SubscriptionRecord[]> => {
	const whereClause = options.list_name
		? and(eq(subscription.hostname, options.hostname), eq(subscription.list_name, options.list_name))
		: eq(subscription.hostname, options.hostname);
	const records = await getDb(db).select().from(subscription).where(whereClause).orderBy(asc(subscription.created_at));
	return records.map(toSubscriptionRecord);
};

export const insertSubscriptionRecord = async (db: D1Database, options: InsertSubscriptionOptions): Promise<void> => {
	await getDb(db)
		.insert(subscription)
		.values({
			created_at: Date.now(),
			email: options.email,
			hostname: options.hostname,
			id: options.id,
			list_name: options.list_name,
			person_name: options.person_name ?? null,
		});
};

export const deleteSubscriptionRecordById = async (db: D1Database, id: string): Promise<void> => {
	await getDb(db).delete(subscription).where(eq(subscription.id, id));
};

export type SubscriptionRecordUniqueValues = Subset<
	SubscriptionRecord,
	{
		email: string;
		hostname: string;
		list_name: string;
	}
>;

export const getSubscriptionRecordByUniqueValues = async (
	db: D1Database,
	options: SubscriptionRecordUniqueValues,
): Promise<SubscriptionRecord | null> => {
	const records = await getDb(db)
		.select()
		.from(subscription)
		.where(
			and(
				eq(subscription.email, options.email),
				eq(subscription.hostname, options.hostname),
				eq(subscription.list_name, options.list_name),
			),
		)
		.limit(1);
	return records[0] ? toSubscriptionRecord(records[0]) : null;
};

export type SetUnsubscribedAtOptions = Subset<
	SubscriptionRecord,
	{
		id: string;
		unsubscribed_at: Date | null;
	}
>;

export const setSubscriptionRecordUnsubscribedAt = async (db: D1Database, options: SetUnsubscribedAtOptions) => {
	const unsubscribed_at = options.unsubscribed_at?.getTime() ?? null;
	await getDb(db).update(subscription).set({ unsubscribed_at }).where(eq(subscription.id, options.id));
};

export type SetEmailSubscriptionOptions = Subset<
	SubscriptionRecord,
	{
		id: string;
		email_confirmed_at: Date | null;
	}
>;

export const setSubscriptionRecordEmailConfirmedAt = async (db: D1Database, options: SetEmailSubscriptionOptions): Promise<void> => {
	const email_confirmed_at = options.email_confirmed_at?.getTime() ?? null;
	await getDb(db).update(subscription).set({ email_confirmed_at }).where(eq(subscription.id, options.id));
};
