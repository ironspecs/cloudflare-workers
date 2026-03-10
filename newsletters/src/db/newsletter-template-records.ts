import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '../lib/drizzle';
import { newsletter_template } from './schema';

export type TemplateRecord = {
	createdAt: Date;
	hostname: string | null;
	markup: string;
	name: string;
	updatedAt: Date;
};

const toTemplateRecord = (row: typeof newsletter_template.$inferSelect): TemplateRecord => {
	return {
		createdAt: new Date(row.created_at),
		hostname: row.hostname,
		markup: row.markup,
		name: row.name,
		updatedAt: new Date(row.updated_at),
	};
};

export const findTemplateByName = async (db: D1Database, name: string): Promise<TemplateRecord | null> => {
	const records = await getDb(db).select().from(newsletter_template).where(eq(newsletter_template.name, name)).limit(1);
	return records[0] ? toTemplateRecord(records[0]) : null;
};

export const listOwnedTemplatesByHostname = async (db: D1Database, hostname: string): Promise<TemplateRecord[]> => {
	const records = await getDb(db)
		.select()
		.from(newsletter_template)
		.where(eq(newsletter_template.hostname, hostname))
		.orderBy(asc(newsletter_template.name));
	return records.map(toTemplateRecord);
};

export const findAccessibleTemplateByHostname = async (
	db: D1Database,
	options: {
		hostname: string;
		name: string;
	},
): Promise<TemplateRecord | null> => {
	const records = await getDb(db)
		.select()
		.from(newsletter_template)
		.where(
			and(
				eq(newsletter_template.name, options.name),
				or(isNull(newsletter_template.hostname), eq(newsletter_template.hostname, options.hostname)),
			),
		)
		.limit(1);
	return records[0] ? toTemplateRecord(records[0]) : null;
};

export const createTemplate = async (
	db: D1Database,
	data: {
		hostname: string | null;
		markup: string;
		name: string;
	},
): Promise<void> => {
	const now = Date.now();
	await getDb(db).insert(newsletter_template).values({
		created_at: now,
		hostname: data.hostname,
		markup: data.markup,
		name: data.name,
		updated_at: now,
	});
};

export const updateOwnedTemplateByName = async (
	db: D1Database,
	data: {
		hostname: string;
		markup: string;
		name: string;
	},
): Promise<void> => {
	await getDb(db)
		.update(newsletter_template)
		.set({
			markup: data.markup,
			updated_at: Date.now(),
		})
		.where(and(eq(newsletter_template.hostname, data.hostname), eq(newsletter_template.name, data.name)));
};

export const deleteOwnedTemplateByName = async (
	db: D1Database,
	data: {
		hostname: string;
		name: string;
	},
): Promise<void> => {
	await getDb(db)
		.delete(newsletter_template)
		.where(and(eq(newsletter_template.hostname, data.hostname), eq(newsletter_template.name, data.name)));
};
