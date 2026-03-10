import { Crypto } from '@cloudflare/workers-types/experimental';

declare global {
	// Only refer to `crypto` in this file. Everywhere else with should refer
	// to methods in this file. This is to ensure that we don't accidentally
	// use the native crypto object, which is not available in the Cloudflare
	// Workers runtime.
	// @ts-ignore override of the "Window" global `crypto` object until CF bugfix.
	const crypto: Crypto;
}

/**
 * Generates a random string of the given length.
 */
export const generateId = (length: number) => {
	const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const characterCount = characters.length;
	const randomValues = new Uint8Array(length);

	crypto.getRandomValues(randomValues);

	for (let i = 0; i < length; i++) {
		result += characters.charAt(randomValues[i] % characterCount);
	}

	return result;
};

export const toHex = (buffer: Uint8Array): string =>
	Array.from(new Uint8Array(buffer))
		.map((b) => ('00' + b.toString(16)).slice(-2))
		.join('');

export const toBase64 = (value: Uint8Array) => {
	let binary = '';
	for (const byte of value) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
};

export const fromBase64 = (value: string) => {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
};

export const toBase64Url = (value: Uint8Array): string => {
	return toBase64(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

export const fromBase64Url = (value: string): Uint8Array => {
	const paddingLength = (4 - (value.length % 4)) % 4;
	return fromBase64(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(paddingLength));
};

export const fromHex = (hex: string): Uint8Array => {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
};

export const sha256Hex = async (value: string): Promise<string> => {
	const encoded = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return toHex(new Uint8Array(digest));
};

export const hmacSha256Base64Url = async (keyBase64: string, value: string): Promise<string> => {
	const key = await crypto.subtle.importKey('raw', fromBase64(keyBase64), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	return toBase64Url(new Uint8Array(signature));
};

/**
 * It's silly that the keyLength is configurable since there is only one optimal
 * key length for each algorithm.
 */
const knownPBKDF2Algorithms = {
	'SHA-1': { keyLength: 160 },
	'SHA-256': { keyLength: 256 },
	'SHA-384': { keyLength: 384 },
	'SHA-512': { keyLength: 512 },
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual?: (a: Uint8Array, b: Uint8Array) => boolean;
	};

	if (typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(left, right);
	}

	let result = 0;
	for (let index = 0; index < left.length; index += 1) {
		result |= left[index] ^ right[index];
	}

	return result === 0;
};

export const timingSafeEqualStrings = (left: string, right: string): boolean => {
	const encodedLeft = new TextEncoder().encode(left);
	const encodedRight = new TextEncoder().encode(right);
	if (encodedLeft.byteLength !== encodedRight.byteLength) {
		return false;
	}

	return timingSafeEqual(encodedLeft, encodedRight);
};

export class PBKDF2 {
	constructor(options: Partial<PBKDF2> = {}) {
		this.algorithm = options.algorithm || 'SHA-256';
		this.iterations = options.iterations || 100000;
		this.delimiter = options.delimiter || '$';
		this.keyLength = options.keyLength || knownPBKDF2Algorithms[this.algorithm].keyLength;
	}
	algorithm: string & keyof typeof knownPBKDF2Algorithms;
	iterations: number;
	delimiter: string;
	keyLength: number;

	async hash(password: string): Promise<string> {
		const name = 'PBKDF2';
		const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), { name }, false, [
			'deriveBits',
			'deriveKey',
		]);

		const salt = crypto.getRandomValues(new Uint8Array(16));
		const derivedKey = await crypto.subtle.deriveBits(
			{
				name,
				salt,
				iterations: this.iterations,
				hash: this.algorithm,
			},
			key,
			this.keyLength,
		);

		const saltHex = toHex(salt);
		const derivedKeyHex = toHex(new Uint8Array(derivedKey));
		return `${saltHex}${this.delimiter}${derivedKeyHex}`;
	}

	async verify(hashedPassword: string, password: string): Promise<boolean> {
		const [saltHex, hashedKeyHex] = hashedPassword.split(this.delimiter);
		const salt = fromHex(saltHex);
		const hashedKey = fromHex(hashedKeyHex);
		const name = 'PBKDF2';

		const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), { name }, false, [
			'deriveBits',
			'deriveKey',
		]);

		const derivedKeyBuffer = await crypto.subtle.deriveBits(
			{
				name,
				salt,
				iterations: this.iterations,
				hash: this.algorithm,
			},
			key,
			this.keyLength,
		);

		const derivedKey = new Uint8Array(derivedKeyBuffer);

		// If they calculated the key with a different algorithm, we can't compare
		// them since they'll be different lengths, so we'll just say it's false.
		if (hashedKey.byteLength !== derivedKey.byteLength) {
			return false;
		}

		return timingSafeEqual(hashedKey, derivedKey);
	}
}
