import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(__dirname, '../..');
const publicTemplatesDir = join(workspaceDir, 'templates/public');

const publicTemplateEntries = [
	{
		name: 'daisyui',
		templatePath: join(publicTemplatesDir, 'daisyui/template.liquid'),
		dataPath: join(publicTemplatesDir, 'daisyui/data.json'),
	},
	{
		name: 'starter',
		templatePath: join(publicTemplatesDir, 'starter/template.liquid'),
		dataPath: join(publicTemplatesDir, 'starter/data.json'),
	},
];

export const listPublicTemplates = () => {
	return publicTemplateEntries.slice();
};

export const getPublicTemplate = (name) => {
	const template = publicTemplateEntries.find((entry) => entry.name === name);
	if (!template) {
		throw new Error(`Unknown public template: ${name}`);
	}

	return template;
};

export const getTemplateWorkspaceDir = () => workspaceDir;
