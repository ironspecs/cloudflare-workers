import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, logInfo, logWarn } from './log';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('logInfo', () => {
	it('logs structured info objects', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

		logInfo('newsletter_example_loaded', {
			hostname: '127.0.0.1',
			route: '/',
		});

		expect(spy).toHaveBeenCalledWith({
			event: 'newsletter_example_loaded',
			hostname: '127.0.0.1',
			route: '/',
		});
	});
});

describe('logWarn', () => {
	it('logs structured warning objects', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		logWarn('newsletter_turnstile_missing', {
			hostname: 'softwarepatterns.com',
		});

		expect(spy).toHaveBeenCalledWith({
			event: 'newsletter_turnstile_missing',
			hostname: 'softwarepatterns.com',
		});
	});
});

describe('logError', () => {
	it('logs structured error objects', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

		logError('newsletter_insert_failed', new Error('boom'), {
			hostname: 'softwarepatterns.com',
			route: '/subscribe',
		});

		expect(spy).toHaveBeenCalledWith({
			error_message: 'boom',
			error_name: 'Error',
			event: 'newsletter_insert_failed',
			hostname: 'softwarepatterns.com',
			route: '/subscribe',
		});
	});
});
