import { describe, expect, it } from 'vitest';
import { createRandomBase64Key, decryptHostnameConfigSecrets, encryptHostnameConfigSecrets } from './hostname-config-secrets';

const env = {
	HOSTNAME_CONFIG_KEKS_JSON: JSON.stringify({
		active_id: 'kek202603101900',
		keys: {
			kek202603101900: createRandomBase64Key(),
		},
	}),
};

describe('hostname config secrets', () => {
	it('encrypts and decrypts a hostname secret with the active KEK', async () => {
		const record = await encryptHostnameConfigSecrets(env, {
			hostname: 'example.com',
			turnstile_secret_key: 'secret-key',
		});

		expect(record.hostname).toBe('example.com');
		expect(record.dek_kek_id).toBe('kek202603101900');
		expect(record.dek_wrapped).toMatch(/^v1\./);
		expect(record.turnstile_secret_key_ciphertext).toMatch(/^v1\./);

		await expect(decryptHostnameConfigSecrets(env, record)).resolves.toEqual({
			turnstile_secret_key: 'secret-key',
		});
	});

	it('fails fast when the wrapped DEK references an unknown KEK', async () => {
		const record = await encryptHostnameConfigSecrets(env, {
			hostname: 'example.com',
			turnstile_secret_key: 'secret-key',
		});

		await expect(
			decryptHostnameConfigSecrets(
				{
					HOSTNAME_CONFIG_KEKS_JSON: JSON.stringify({
						active_id: 'kek202603101901',
						keys: {
							kek202603101901: createRandomBase64Key(),
						},
					}),
				},
				{
					...record,
					dek_kek_id: 'kek202603101900',
				},
			),
		).rejects.toThrow('Unknown hostname config KEK');
	});
});
