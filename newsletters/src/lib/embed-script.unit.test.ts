import { describe, expect, it } from 'vitest';
import { createEmbedScript } from './embed-script';

describe('createEmbedScript', () => {
	it('includes the explicit Turnstile script and both browser integration layers', () => {
		const source = createEmbedScript();

		expect(source).toContain('api.js?render=explicit');
		expect(source).toContain('window.Newsletters');
		expect(source).toContain("open: ({ listName = '', personName = '' } = {}) =>");
		expect(source).toContain('createSession: async');
		expect(source).toContain('renderTurnstile: async');
		expect(source).toContain('subscribe: async');
	});

	it('manages the default dialog and template hook contract', () => {
		const source = createEmbedScript();

		expect(source).toContain('turnstile.render');
		expect(source).toContain('turnstile.reset');
		expect(source).toContain('turnstile.remove');
		expect(source).toContain('/newsletters/session');
		expect(source).toContain('/newsletters/templates/');
		expect(source).toContain('/subscribe');
		expect(source).toContain("searchParams.get('mode') === 'demo'");
		expect(source).toContain('X-Submit-Token');
		expect(source).toContain("searchParams.get('template')");
		expect(source).toContain('closeTriggers');
		expect(source).toContain('querySelectorAll(selector)');
		expect(source).toContain('Array.isArray(window.Newsletters.open.q)');
		expect(source).toContain('queuedOpenCalls');
		expect(source).toContain('realApi.open(options)');
		expect(source).toContain('data-newsletters-email');
		expect(source).toContain('data-newsletters-turnstile');
		expect(source).toContain('INVALID_TEMPLATE_FORM');
		expect(source).toContain('INVALID_TEMPLATE_EMAIL');
		expect(source).toContain('TURNSTILE_NOT_READY');
		expect(source).toContain('INVALID_SUBMIT_TOKEN');
		expect(source).toContain("console.error('[Newsletters]'");
	});
});
