import { describe, expect, it } from 'vitest';
import { PBKDF2, fromHex, generateId, toHex } from './crypto';

describe('generateId', () => {
	it('generates a string of the correct length', () => {
		expect(generateId(10)).toHaveLength(10);
	});

	it('generates only lowercase alphanumeric characters', () => {
		expect(generateId(20)).toMatch(/^[a-z0-9]+$/);
	});
});

describe('Hexadecimal Conversion', () => {
	it('converts between Uint8Array and hexadecimal string correctly', () => {
		const original = new Uint8Array([0, 1, 2, 254, 255]);
		expect(fromHex(toHex(original))).toEqual(original);
	});

	it('converts Uint8Array to hexadecimal string', () => {
		expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
	});

	it('parses hexadecimal string to Uint8Array', () => {
		expect(fromHex('000f10ff')).toEqual(new Uint8Array([0, 15, 16, 255]));
	});
});

describe('PBKDF2', () => {
	it('generates a hash with the correct format', async () => {
		const hash = await new PBKDF2().hash('testPassword');
		expect(hash).toMatch(/[0-9a-f]{32}\$[0-9a-f]+/);
	});

	it('verifies a matching password', async () => {
		const pbkdf2 = new PBKDF2();
		const hash = await pbkdf2.hash('testPassword');
		await expect(pbkdf2.verify(hash, 'testPassword')).resolves.toBe(true);
	});

	it('rejects a non-matching password', async () => {
		const pbkdf2 = new PBKDF2();
		const hash = await pbkdf2.hash('testPassword');
		await expect(pbkdf2.verify(hash, 'wrongPassword')).resolves.toBe(false);
	});
});
