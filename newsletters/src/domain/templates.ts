import type { Env } from '../common';
import {
	createTemplate,
	deleteOwnedTemplateByName,
	findAccessibleTemplateByHostname,
	findTemplateByName,
	listOwnedTemplatesByHostname,
	type TemplateRecord,
	updateOwnedTemplateByName,
} from '../db/newsletter-template-records';

const REQUIRED_TEMPLATE_HOOKS = [
	'data-newsletters-email',
	'data-newsletters-turnstile',
	'data-newsletters-error',
	'data-newsletters-submit',
] as const;

const containsRequiredTemplateHooks = (markup: string): boolean => {
	const trimmedMarkup = markup.trim();
	if (trimmedMarkup.length === 0) {
		return false;
	}

	if (!trimmedMarkup.includes('<form') && !trimmedMarkup.includes('<template')) {
		return false;
	}

	return REQUIRED_TEMPLATE_HOOKS.every((hook) => trimmedMarkup.includes(hook));
};

export const listOwnedTemplates = async (env: Env, hostname: string) => {
	return listOwnedTemplatesByHostname(env.NewslettersD1, hostname);
};

export const getOwnedTemplate = async (
	env: Env,
	options: {
		hostname: string;
		name: string;
	},
) => {
	const template = await findTemplateByName(env.NewslettersD1, options.name);
	if (template === null || template.hostname !== options.hostname) {
		return null;
	}

	return template;
};

export const createOwnedTemplate = async (
	env: Env,
	options: {
		hostname: string;
		markup: string;
		name: string;
	},
): Promise<{ code: 'ALREADY_EXISTS' | 'INVALID_TEMPLATE_MARKUP' } | { code: 'CREATED'; template: TemplateRecord }> => {
	if (!containsRequiredTemplateHooks(options.markup)) {
		return { code: 'INVALID_TEMPLATE_MARKUP' };
	}

	const existingTemplate = await findTemplateByName(env.NewslettersD1, options.name);
	if (existingTemplate !== null) {
		return { code: 'ALREADY_EXISTS' };
	}

	await createTemplate(env.NewslettersD1, {
		hostname: options.hostname,
		markup: options.markup,
		name: options.name,
	});

	const createdTemplate = await findTemplateByName(env.NewslettersD1, options.name);
	if (createdTemplate === null || createdTemplate.hostname !== options.hostname) {
		throw new Error('CREATED_TEMPLATE_NOT_FOUND');
	}

	return { code: 'CREATED', template: createdTemplate };
};

export const updateOwnedTemplate = async (
	env: Env,
	options: {
		hostname: string;
		markup: string;
		name: string;
	},
): Promise<{ code: 'INVALID_TEMPLATE_MARKUP' | 'NOT_FOUND' } | { code: 'UPDATED'; template: TemplateRecord }> => {
	if (!containsRequiredTemplateHooks(options.markup)) {
		return { code: 'INVALID_TEMPLATE_MARKUP' };
	}

	const existingTemplate = await findTemplateByName(env.NewslettersD1, options.name);
	if (existingTemplate === null || existingTemplate.hostname !== options.hostname) {
		return { code: 'NOT_FOUND' };
	}

	await updateOwnedTemplateByName(env.NewslettersD1, options);

	const updatedTemplate = await findTemplateByName(env.NewslettersD1, options.name);
	if (updatedTemplate === null || updatedTemplate.hostname !== options.hostname) {
		throw new Error('UPDATED_TEMPLATE_NOT_FOUND');
	}

	return { code: 'UPDATED', template: updatedTemplate };
};

export const deleteOwnedTemplate = async (
	env: Env,
	options: {
		hostname: string;
		name: string;
	},
) => {
	const existingTemplate = await findTemplateByName(env.NewslettersD1, options.name);
	if (existingTemplate === null || existingTemplate.hostname !== options.hostname) {
		return { code: 'NOT_FOUND' as const };
	}

	await deleteOwnedTemplateByName(env.NewslettersD1, options);
	return { code: 'DELETED' as const };
};

export const findTemplateVisibleToHostname = async (
	env: Env,
	options: {
		hostname: string;
		name: string;
	},
) => {
	return findAccessibleTemplateByHostname(env.NewslettersD1, options);
};
