import { syncPublicTemplateByName } from './lib/public-template-sync.mjs';

const main = async () => {
	const templateName = process.argv[2];
	if (!templateName) {
		throw new Error('Missing template name. Usage: node ./scripts/sync-public-template.mjs <template-name>');
	}

	const template = await syncPublicTemplateByName(templateName);
	console.log(`Synced public template: ${template.name}`);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
