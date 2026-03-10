import type { D1Database } from '@cloudflare/workers-types';
import { and, eq } from 'drizzle-orm';
import { Subset } from '../common';
import { getDb } from '../lib/drizzle';
import { list_config } from './schema';

export const enum EmailConfirm {
	Link = 'link',
	Code = 'code',
}

export type ListConfig = {
	id: string;
	hostname: string;
	list_name: string;
	email_confirm?: EmailConfirm;
};

export type ListConfigUniqueValues = Subset<
	ListConfig,
	{
		hostname: string;
		list_name?: string;
	}
>;

type ListConfigRow = typeof list_config.$inferSelect;

const toListConfig = (row: ListConfigRow): ListConfig => {
	return {
		...row,
		email_confirm: row.email_confirm === null ? undefined : (row.email_confirm as EmailConfirm),
	};
};

export const getListConfigRecordById = async (db: D1Database, id: string): Promise<ListConfig | null> => {
	const records = await getDb(db).select().from(list_config).where(eq(list_config.id, id)).limit(1);
	return records[0] ? toListConfig(records[0]) : null;
};

export const insertListConfigRecord = async (db: D1Database, data: ListConfig): Promise<void> => {
	await getDb(db).insert(list_config).values(data);
};

export const updateListConfigRecord = async (db: D1Database, data: ListConfig): Promise<void> => {
	await getDb(db).update(list_config).set({ email_confirm: data.email_confirm }).where(eq(list_config.id, data.id));
};

export const deleteListConfigRecord = async (db: D1Database, id: string): Promise<void> => {
	await getDb(db).delete(list_config).where(eq(list_config.id, id));
};

export const getListConfigRecordByUniqueValues = async (db: D1Database, options: ListConfigUniqueValues): Promise<ListConfig | null> => {
	const listName = options.list_name ?? '';
	const records = await getDb(db)
		.select()
		.from(list_config)
		.where(and(eq(list_config.hostname, options.hostname), eq(list_config.list_name, listName)))
		.limit(1);
	return records[0] ? toListConfig(records[0]) : null;
};
