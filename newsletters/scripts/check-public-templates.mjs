import { listPublicTemplates } from './lib/template-registry.mjs';
import { renderPublicTemplateByName } from './lib/render-public-template.mjs';
import { validatePublicTemplateMarkup } from './lib/validate-public-template.mjs';

const main = async () => {
	for (const template of listPublicTemplates()) {
		const renderedTemplate = await renderPublicTemplateByName(template.name);
		validatePublicTemplateMarkup(renderedTemplate.markup);
		console.log(`Validated public template: ${template.name}`);
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
