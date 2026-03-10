import { describe, expect, it } from 'vitest';
import { createEmbedScript } from './embed-script';

describe('createEmbedScript', () => {
	it('includes the explicit Turnstile script and global API', () => {
		const source = createEmbedScript();

		expect(source).toContain('api.js?render=explicit');
		expect(source).toContain('window.Newsletters');
		expect(source).toContain('open: async');
	});

	it('manages the newsletters embed lifecycle with explicit render helpers', () => {
		const source = createEmbedScript();

		expect(source).toContain('turnstile.render');
		expect(source).toContain('turnstile.reset');
		expect(source).toContain('turnstile.remove');
		expect(source).toContain('/newsletters/session');
		expect(source).toContain('/subscribe');
	});
});
