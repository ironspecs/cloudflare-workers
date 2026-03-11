import { renderPublicTemplateByName } from './lib/render-public-template.mjs';
import { validatePublicTemplateMarkup } from './lib/validate-public-template.mjs';

const main = async () => {
	const templateName = process.argv[2];
	if (!templateName) {
		throw new Error('Missing template name. Usage: node ./scripts/render-public-template.mjs <template-name>');
	}

	const template = await renderPublicTemplateByName(templateName);
	validatePublicTemplateMarkup(template.markup);
	process.stdout.write(template.markup);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
