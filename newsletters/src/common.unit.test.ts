import { describe, expect, it } from 'vitest';
import { isErrorWithMessage, isNonNullObject, isString, isTimeExpired } from './common';

describe('common helpers', () => {
	it('checks strings and objects strictly', () => {
		expect(isString('test')).toBe(true);
		expect(isString(1)).toBe(false);
		expect(isNonNullObject({})).toBe(true);
		expect(isNonNullObject(null)).toBe(false);
	});

	it('detects expiry boundaries', () => {
		expect(isTimeExpired(Date.now() - 1)).toBe(true);
		expect(isTimeExpired(Date.now() + 60_000)).toBe(false);
	});

	it('detects error-like values with name and message', () => {
		expect(isErrorWithMessage({ message: 'bad', name: 'Error' })).toBe(true);
		expect(isErrorWithMessage({ message: 'bad' })).toBe(false);
	});
});
