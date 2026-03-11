import { describe, expect, it } from 'vitest';
import { listPublicTemplates } from '../../scripts/lib/template-registry.mjs';
import { renderPublicTemplateByName } from '../../scripts/lib/render-public-template.mjs';
import { validatePublicTemplateMarkup } from '../../scripts/lib/validate-public-template.mjs';

describe('public template system', () => {
	it('renders and validates every public template', async () => {
		for (const template of listPublicTemplates()) {
			const renderedTemplate = await renderPublicTemplateByName(template.name);

			expect(renderedTemplate.name).toBe(template.name);
			expect(renderedTemplate.markup).toContain(`<template id="newsletter-template-${template.name}">`);
			expect(validatePublicTemplateMarkup(renderedTemplate.markup)).toBe(true);
		}
	});

	it('rejects invalid public template markup', () => {
		expect(() => validatePublicTemplateMarkup('<template><form method="dialog"></form></template>')).toThrowError('INVALID_TEMPLATE_EMAIL');
		expect(() =>
			validatePublicTemplateMarkup(
				'<template><form method="dialog"><script></script><input data-newsletters-email /><div data-newsletters-turnstile></div><p data-newsletters-error></p><button data-newsletters-submit></button><button data-newsletters-close></button><div data-newsletters-success></div><div data-newsletters-success-content></div></form></template>',
			),
		).toThrowError('INVALID_TEMPLATE_SCRIPT_TAG');
	});
});
