import { describe, expect, it } from 'vitest';
import {
	TURNSTILE_TEST_SECRET_KEY,
	TURNSTILE_TEST_SITE_KEY,
	getEmailHostname,
	isAcceptedTurnstileHostname,
	isAutomaticSinkEmailHostname,
} from './hostname-policy';

describe('getEmailHostname', () => {
	it('returns the normalized email domain', () => {
		expect(getEmailHostname('Person@Example.COM')).toBe('example.com');
	});

	it('fails fast on invalid email strings', () => {
		expect(() => getEmailHostname('example.com')).toThrow(/Invalid email address/);
	});
});

describe('isAutomaticSinkEmailHostname', () => {
	it('treats reserved test domains as sinks', () => {
		expect(isAutomaticSinkEmailHostname('example.com')).toBe(true);
		expect(isAutomaticSinkEmailHostname('example.net')).toBe(true);
		expect(isAutomaticSinkEmailHostname('localhost')).toBe(true);
		expect(isAutomaticSinkEmailHostname('invalid')).toBe(true);
		expect(isAutomaticSinkEmailHostname('demo.test')).toBe(true);
		expect(isAutomaticSinkEmailHostname('dev.localhost')).toBe(true);
		expect(isAutomaticSinkEmailHostname('nope.invalid')).toBe(true);
	});

	it('does not sink real mailbox provider hostnames', () => {
		expect(isAutomaticSinkEmailHostname('gmail.com')).toBe(false);
		expect(isAutomaticSinkEmailHostname('outlook.com')).toBe(false);
		expect(isAutomaticSinkEmailHostname('live.com')).toBe(false);
	});

	it('does not sink normal website hostnames', () => {
		expect(isAutomaticSinkEmailHostname('softwarepatterns.com')).toBe(false);
	});
});

describe('turnstile test constants', () => {
	it('exposes the Cloudflare test credentials', () => {
		expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA');
		expect(TURNSTILE_TEST_SECRET_KEY).toBe('1x0000000000000000000000000000000AA');
	});
});

describe('isAcceptedTurnstileHostname', () => {
	it('requires an exact hostname match', () => {
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'softwarepatterns.com')).toBe(true);
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'localhost')).toBe(false);
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'example.com')).toBe(false);
	});
});
