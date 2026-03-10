import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { hostname_config } from './schema';
import { getDb } from '../lib/drizzle';

/**
 * HostnameConfigs represent a known hostname that is allowed to use the service.
 *
 * Each is fetched before any modifying operation is allowed to be performed, and it
 * contains configuration for that particular hostname.
 */
export type HostnameConfig = {
	hostname: string;
	turnstile_site_key: string | null;
};

export const getHostnameConfigByHostname = async (db: D1Database, hostname: string): Promise<HostnameConfig | null> => {
	const records = await getDb(db).select().from(hostname_config).where(eq(hostname_config.hostname, hostname)).limit(1);
	return records[0] ?? null;
};

export const insertHostnameConfig = async (db: D1Database, data: HostnameConfig): Promise<void> => {
	await getDb(db).insert(hostname_config).values(data);
};

export const deleteHostnameConfig = async (db: D1Database, hostname: string): Promise<void> => {
	await getDb(db).delete(hostname_config).where(eq(hostname_config.hostname, hostname));
};
