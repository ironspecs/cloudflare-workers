import { describe, expect, it } from 'vitest';
import {
	TURNSTILE_TEST_SECRET_KEY,
	TURNSTILE_TEST_SITE_KEY,
	getEmailHostname,
	isAcceptedTurnstileHostname,
	isAutomaticSinkEmailHostname,
	isAutomaticSinkSiteHostname,
	isLocalDevelopmentHostname,
} from './hostname-policy';

describe('isLocalDevelopmentHostname', () => {
	it('accepts localhost-style development hostnames', () => {
		expect(isLocalDevelopmentHostname('localhost')).toBe(true);
		expect(isLocalDevelopmentHostname('127.0.0.1')).toBe(true);
		expect(isLocalDevelopmentHostname('LOCALHOST')).toBe(true);
	});

	it('rejects normal hostnames', () => {
		expect(isLocalDevelopmentHostname('softwarepatterns.com')).toBe(false);
	});
});

describe('getEmailHostname', () => {
	it('returns the normalized email domain', () => {
		expect(getEmailHostname('Person@Example.COM')).toBe('example.com');
	});

	it('fails fast on invalid email strings', () => {
		expect(() => getEmailHostname('example.com')).toThrow(/Invalid email address/);
	});
});

describe('isAutomaticSinkSiteHostname', () => {
	it('treats local development hostnames as sinks', () => {
		expect(isAutomaticSinkSiteHostname('localhost')).toBe(true);
		expect(isAutomaticSinkSiteHostname('127.0.0.1')).toBe(true);
	});

	it('does not sink normal website hostnames', () => {
		expect(isAutomaticSinkSiteHostname('softwarepatterns.com')).toBe(false);
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
	it('accepts Cloudflare test hostnames for local development', () => {
		expect(isAcceptedTurnstileHostname('localhost', 'example.com')).toBe(true);
		expect(isAcceptedTurnstileHostname('127.0.0.1', 'localhost')).toBe(true);
		expect(isAcceptedTurnstileHostname('127.0.0.1', '127.0.0.1')).toBe(true);
	});

	it('requires an exact hostname match for non-local hostnames', () => {
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'softwarepatterns.com')).toBe(true);
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'localhost')).toBe(false);
		expect(isAcceptedTurnstileHostname('softwarepatterns.com', 'example.com')).toBe(false);
	});
});
