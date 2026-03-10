import type { Env } from '../common';
import type { HostnameConfigSecretsRecord } from '../db/hostname-config-secret-records';

type KeksConfig = {
	active_id: string;
	keys: Record<string, string>;
};

type HostnameConfigSecrets = {
	turnstile_secret_key: string;
};

const AES_ALGORITHM = 'AES-GCM';
const ENVELOPE_VERSION = 'v1';
const IV_LENGTH = 12;

const encodeUtf8 = (value: string) => new TextEncoder().encode(value);
const decodeUtf8 = (value: BufferSource) => new TextDecoder().decode(value);

const toBase64 = (value: Uint8Array) => {
	let binary = '';
	for (const byte of value) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
};

const fromBase64 = (value: string) => {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
};

const parseKeksConfig = (serialized: string): KeksConfig => {
	const parsed = JSON.parse(serialized) as Partial<KeksConfig>;
	if (!parsed || typeof parsed !== 'object' || typeof parsed.active_id !== 'string' || !parsed.keys || typeof parsed.keys !== 'object') {
		throw new Error('Invalid hostname config KEKs');
	}

	const activeKey = parsed.keys[parsed.active_id];
	if (typeof activeKey !== 'string' || activeKey.length === 0) {
		throw new Error('Missing active hostname config KEK');
	}

	return {
		active_id: parsed.active_id,
		keys: parsed.keys as Record<string, string>,
	};
};

const importAesKey = async (keyBase64: string): Promise<CryptoKey> => {
	return crypto.subtle.importKey('raw', fromBase64(keyBase64), { name: AES_ALGORITHM }, false, ['decrypt', 'encrypt']);
};

const createEnvelopeAad = (hostname: string, fieldName: string) =>
	encodeUtf8(`hostname_config_secrets|${hostname}|${fieldName}|${ENVELOPE_VERSION}`);

const encryptString = async (keyBase64: string, plaintext: string, aad: Uint8Array) => {
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await importAesKey(keyBase64);
	const ciphertext = await crypto.subtle.encrypt(
		{
			additionalData: aad,
			iv,
			name: AES_ALGORITHM,
		},
		key,
		encodeUtf8(plaintext),
	);

	return `${ENVELOPE_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
};

const decryptString = async (keyBase64: string, envelope: string, aad: Uint8Array) => {
	const [version, ivBase64, ciphertextBase64] = envelope.split('.');
	if (version !== ENVELOPE_VERSION || !ivBase64 || !ciphertextBase64) {
		throw new Error('Invalid hostname config secret envelope');
	}

	const key = await importAesKey(keyBase64);
	const plaintext = await crypto.subtle.decrypt(
		{
			additionalData: aad,
			iv: fromBase64(ivBase64),
			name: AES_ALGORITHM,
		},
		key,
		fromBase64(ciphertextBase64),
	);

	return decodeUtf8(plaintext);
};

const getKeksConfig = (env: Env) => parseKeksConfig(env.HOSTNAME_CONFIG_KEKS_JSON);

export const createRandomBase64Key = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));

export const encryptHostnameConfigSecrets = async (
	env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>,
	options: {
		hostname: string;
		turnstile_secret_key: string;
	},
): Promise<HostnameConfigSecretsRecord> => {
	const keks = getKeksConfig(env as Env);
	const dek = createRandomBase64Key();

	return {
		dek_kek_id: keks.active_id,
		dek_wrapped: await encryptString(keks.keys[keks.active_id], dek, createEnvelopeAad(options.hostname, 'dek_wrapped')),
		hostname: options.hostname,
		turnstile_secret_key_ciphertext: await encryptString(
			dek,
			options.turnstile_secret_key,
			createEnvelopeAad(options.hostname, 'turnstile_secret_key'),
		),
	};
};

export const decryptHostnameConfigSecrets = async (
	env: Pick<Env, 'HOSTNAME_CONFIG_KEKS_JSON'>,
	record: HostnameConfigSecretsRecord,
): Promise<HostnameConfigSecrets> => {
	const keks = getKeksConfig(env as Env);
	const kek = keks.keys[record.dek_kek_id];
	if (!kek) {
		throw new Error(`Unknown hostname config KEK: ${record.dek_kek_id}`);
	}

	const dek = await decryptString(kek, record.dek_wrapped, createEnvelopeAad(record.hostname, 'dek_wrapped'));

	return {
		turnstile_secret_key: await decryptString(
			dek,
			record.turnstile_secret_key_ciphertext,
			createEnvelopeAad(record.hostname, 'turnstile_secret_key'),
		),
	};
};
