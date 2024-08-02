import { Env } from "../common";
import { EmailContact, EmailContent, EmailDkimConfig, EmailPolicy } from "./types";

type EmailLogEntry = {
	to: EmailContact[];
	from: EmailContact;
	subject: string;
	content: EmailContent[];
	dkim: EmailDkimConfig;
};

const logsKVPrefix = 'LOGS';

/**
 * Logger is a domain class for log events.
 *
 * This class also provides CRUD operations for the logs.
 */
export class Logger {
	private env: Env;
	private policies: EmailPolicy[];

	constructor(env: Env, policies: EmailPolicy[]) {
		this.env = env;
		this.policies = policies;
	}

	/**
	 * Log an event to the KV store. Does not return a response.
	 */
	async logEvent(eventName: string, entry: EmailLogEntry) {
		const ts = Date.now().toString();
		const dkim = entry.dkim;
		const redactedDkim = { ...dkim, dkim_private_key: dkim.dkim_private_key.substring(0, 10) + '...' };
		const logPolicy = this.policies.find((p) => p.name === 'email:log');

		// Default is one month in seconds.
		let expirationTtl = 60 * 60 * 24 * 30;
		if (logPolicy) {
			const ttl = logPolicy.config.ttlSeconds;
			if (ttl) {
				expirationTtl = ttl;
			}
		}

		await this.env.EMAIL.put(`${logsKVPrefix}/${ts}`, JSON.stringify({ eventName, ts, ...entry, dkim: redactedDkim }), { expirationTtl });
	}
}

export class LogRouter {
	private env: Env;
	private policies: EmailPolicy[];

	constructor(env: Env, policies: EmailPolicy[]) {
		this.env = env;
		this.policies = policies;
	}

	/**
	 * List all events in the KV store. Returns a response.
	 */
	async listEvents() {
		const logPolicy = this.policies.find((p) => p.name === 'email:log');
		if (!logPolicy) {
			return new Response('Not allowed', { status: 403 });
		}

		// If they are allowed to read logs, list them.
		if (!logPolicy.config.permissions.includes('read')) {
			return new Response('Not allowed', { status: 403 });
		}

		const timestampPrefix = Date.now().toString().slice(0, -7); // Limit by hours
		const logs = await this.env.EMAIL.list({ prefix: `${logsKVPrefix}/${timestampPrefix}` });
		return new Response(JSON.stringify(await Promise.all(logs.keys.map((key) => this.env.EMAIL.get(key.name)))));
	}

	/**
	 * Delete an event from the KV store. Returns a response.
	 */
	async deleteEvent(key: string) {
		const logPolicy = this.policies.find((p) => p.name === 'email:log');
		if (!logPolicy) {
			return new Response('Not allowed', { status: 403 });
		}

		if (!logPolicy.config.permissions.includes('delete')) {
			return new Response('Not allowed', { status: 403 });
		}

		await this.env.EMAIL.delete(`${logsKVPrefix}/${key}`);
		return new Response('OK');
	}

	/**
	 * Read an event from the KV store. Returns a response.
	 */
	async readEvent(key: string) {
		const logPolicy = this.policies.find((p) => p.name === 'email:log');
		if (!logPolicy) {
			return new Response('Not allowed', { status: 403 });
		}

		if (!logPolicy.config.permissions.includes('read')) {
			return new Response('Not allowed', { status: 403 });
		}

		const value = await this.env.EMAIL.get(`${logsKVPrefix}/${key}`);
		return value ? new Response(value) : new Response('Not found', { status: 404 });
	}
}
