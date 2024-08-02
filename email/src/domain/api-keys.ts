import { safeParse } from "valibot";
import { ApiKeyInfoSchema } from "./types";

/**
 * Get the API key info from the API keys worker.
 */
export const getApiKeyInfo = async (apiKey: string) => {
	const apiKeyInfoResponse = await fetch(`https://api-keys-prod.softwarepatterns.workers.dev/api-keys/${apiKey}`);

	if (!apiKeyInfoResponse.ok) {
		return null;
	}

	const parsedResponse = safeParse(ApiKeyInfoSchema, apiKeyInfoResponse.json());
	if (!parsedResponse.success) {
		return null;
	}

	const { tenantId, expires } = parsedResponse.output;

	if (tenantId !== 'email') {
		return null;
	}

	if (expires < Date.now()) {
		return null;
	}

	return parsedResponse.output;
}
