import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const hostname_config = sqliteTable('hostname_config', {
	hostname: text('hostname').notNull().primaryKey(),
	jwks_url: text('jwks_url'),
	turnstile_site_key: text('turnstile_site_key'),
});

export const hostname_config_secrets = sqliteTable('hostname_config_secrets', {
	hostname: text('hostname').notNull().primaryKey(),
	dek_kek_id: text('dek_kek_id').notNull(),
	dek_wrapped: text('dek_wrapped').notNull(),
	turnstile_secret_key_ciphertext: text('turnstile_secret_key_ciphertext').notNull(),
});

export const list_config = sqliteTable(
	'list_config',
	{
		id: text('id').notNull().primaryKey(),
		hostname: text('hostname').notNull(),
		list_name: text('list_name').notNull(),
		email_confirm: text('email_confirm'),
	},
	(table) => [uniqueIndex('list_config_hostname_list_name').on(table.hostname, table.list_name)],
);

export const subscription = sqliteTable(
	'subscription',
	{
		id: text('id').notNull().primaryKey(),
		email: text('email').notNull(),
		hostname: text('hostname').notNull(),
		list_name: text('list_name').notNull(),
		created_at: integer('created_at', { mode: 'number' }).notNull(),
		person_name: text('person_name'),
		email_confirmed_at: integer('email_confirmed_at', { mode: 'number' }),
		unsubscribed_at: integer('unsubscribed_at', { mode: 'number' }),
	},
	(table) => [uniqueIndex('subscription_email_hostname_list_name').on(table.email, table.hostname, table.list_name)],
);

export const subscription_token = sqliteTable(
	'subscription_token',
	{
		id: text('id').notNull().primaryKey(),
		subscription_id: text('subscription_id').notNull(),
		token_type: text('token_type').notNull(),
		expires_at: integer('expires_at', { mode: 'number' }).notNull(),
	},
	(table) => [uniqueIndex('subscription_token_subscription_id_token_type').on(table.subscription_id, table.token_type)],
);
