import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';
import { getPublicTemplate, getTemplateWorkspaceDir } from './template-registry.mjs';

const templatesRootDir = join(getTemplateWorkspaceDir(), 'templates');

const loadTemplateData = async (template) => {
	const source = await readFile(template.dataPath, 'utf8');
	const parsed = JSON.parse(source);

	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`Invalid template data: ${template.name}`);
	}

	return parsed;
};

const createLiquidEngine = (template) => {
	return new Liquid({
		extname: '.liquid',
		relativeReference: false,
		root: [dirname(template.templatePath), join(templatesRootDir, 'partials')],
	});
};

export const renderPublicTemplateByName = async (name) => {
	const template = getPublicTemplate(name);
	const engine = createLiquidEngine(template);
	const data = await loadTemplateData(template);
	const markup = await engine.renderFile('template', data);

	if (typeof markup !== 'string' || markup.trim().length === 0) {
		throw new Error(`Rendered empty template: ${name}`);
	}

	return {
		markup,
		name: template.name,
	};
};
