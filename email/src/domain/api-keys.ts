import { safeParse } from "valibot";
import { ApiKeyInfoSchema } from "./types";
import { Env } from "../common";

/**
 * Is valid if only letters and numbers, and longer than 8 characters.
 */
const isValidApiKey = (apiKey: string) => /^[a-zA-Z0-9]{8,}$/.test(apiKey);

/**
 * Get the API key info from the API keys worker.
 */
export const getApiKeyInfo = async (request: Request, env: Env) => {
	let apiKey = request.headers.get('Authorization');

	if (!apiKey) {
		apiKey = new URL(request.url).searchParams.get('api_key');

		if (!apiKey) {
			return null;
		}
	}

	if (!isValidApiKey(apiKey)) {
		return null;
	}

	const apiKeyInfoResponse = await env.API_KEYS.fetch(
		`https://api-keys-prod.softwarepatterns.workers.dev/api-keys/${apiKey}`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);

	if (!apiKeyInfoResponse.ok) {
		console.log('apiKeyInfoResponse not ok', apiKeyInfoResponse.status, apiKeyInfoResponse.statusText, url, apiKeyInfoResponse.url);
		return null;
	}

	const obj = await apiKeyInfoResponse.json();

	const parsedResponse = safeParse(ApiKeyInfoSchema, obj);
	if (!parsedResponse.success) {
		console.log('parsedResponse', parsedResponse);
		return null;
	}

	const { tenantId, expires } = parsedResponse.output;
	if (tenantId !== 'email') {
		console.log('tenantId', tenantId);
		return null;
	}

	const now = Date.now();
	if (expires < now) {
		console.log('expired permission:', `${expires} < ${now}`);
		return null;
	}

	return parsedResponse.output;
}
