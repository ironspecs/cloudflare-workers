import { Env } from "../common";
import { EmailDkimConfig } from "./types";

const dkimConfigsKVPrefix = 'DKIM_CONFIGS';

export const saveDKIMConfig = async (env: Env, dkimConfig: EmailDkimConfig): Promise<void> => {
	await env.EMAIL.put(`${dkimConfigsKVPrefix}/${dkimConfig.dkim_domain}`, JSON.stringify(dkimConfig));
};

export const getDkimConfig = async (env: Env, domain: string,): Promise<EmailDkimConfig | null> => {
	const config = await env.EMAIL.get(`${dkimConfigsKVPrefix}/${domain}`);
	if (!config) {
		return null;
	}
	return JSON.parse(config);
}
