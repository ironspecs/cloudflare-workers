import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/drizzle';
import { hostname_config_secrets } from './schema';

export type HostnameConfigSecretsRecord = {
	dek_kek_id: string;
	dek_wrapped: string;
	hostname: string;
	turnstile_secret_key_ciphertext: string;
};

export const getHostnameConfigSecretsByHostname = async (db: D1Database, hostname: string): Promise<HostnameConfigSecretsRecord | null> => {
	const records = await getDb(db).select().from(hostname_config_secrets).where(eq(hostname_config_secrets.hostname, hostname)).limit(1);
	return records[0] ?? null;
};

export const insertHostnameConfigSecrets = async (db: D1Database, data: HostnameConfigSecretsRecord): Promise<void> => {
	await getDb(db).insert(hostname_config_secrets).values(data);
};
