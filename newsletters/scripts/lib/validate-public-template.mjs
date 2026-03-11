import { parseHTML } from 'linkedom';

const REQUIRED_EXACTLY_ONE_SELECTORS = [
	{ errorCode: 'INVALID_TEMPLATE_EMAIL', selector: '[data-newsletters-email]' },
	{ errorCode: 'INVALID_TEMPLATE_TURNSTILE', selector: '[data-newsletters-turnstile]' },
	{ errorCode: 'INVALID_TEMPLATE_ERROR', selector: '[data-newsletters-error]' },
	{ errorCode: 'INVALID_TEMPLATE_SUBMIT', selector: '[data-newsletters-submit]' },
	{ errorCode: 'INVALID_TEMPLATE_SUCCESS', selector: '[data-newsletters-success]' },
	{ errorCode: 'INVALID_TEMPLATE_SUCCESS_CONTENT', selector: '[data-newsletters-success-content]' },
];

const countMatches = (root, selector) => root.querySelectorAll(selector).length;

const assertCount = (root, selector, expectedCount, errorCode) => {
	if (countMatches(root, selector) !== expectedCount) {
		throw new Error(errorCode);
	}
};

const assertNoScriptTags = (root) => {
	if (root.querySelector('script')) {
		throw new Error('INVALID_TEMPLATE_SCRIPT_TAG');
	}
};

const assertSingleTemplateRoot = (document) => {
	const rootNodes = Array.from(document.childNodes).filter((node) => {
		if (node.nodeType === 8) {
			return false;
		}

		if (node.nodeType === 3) {
			return node.textContent?.trim().length;
		}

		return true;
	});
	const templateElements = document.querySelectorAll('template');
	if (templateElements.length !== 1 || rootNodes.length !== 1 || rootNodes[0] !== templateElements[0]) {
		throw new Error('INVALID_TEMPLATE_ROOT');
	}

	return templateElements[0];
};

const assertSingleDialogForm = (templateElement) => {
	const formElements = templateElement.content.querySelectorAll('form');
	if (formElements.length !== 1) {
		throw new Error('INVALID_TEMPLATE_FORM');
	}

	const formElement = formElements[0];
	if (formElement.getAttribute('method') !== 'dialog') {
		throw new Error('INVALID_TEMPLATE_FORM');
	}

	if (formElement.querySelector('form')) {
		throw new Error('INVALID_TEMPLATE_NESTED_FORM');
	}

	return formElement;
};

const assertRequiredHooks = (formElement) => {
	for (const hook of REQUIRED_EXACTLY_ONE_SELECTORS) {
		assertCount(formElement, hook.selector, 1, hook.errorCode);
	}

	if (countMatches(formElement, '[data-newsletters-close]') < 1) {
		throw new Error('INVALID_TEMPLATE_CLOSE');
	}

	const personNameMatches = countMatches(formElement, '[data-newsletters-person-name]');
	if (personNameMatches > 1) {
		throw new Error('INVALID_TEMPLATE_PERSON_NAME');
	}
};

export const validatePublicTemplateMarkup = (markup) => {
	if (typeof markup !== 'string' || markup.trim().length === 0) {
		throw new Error('INVALID_TEMPLATE_EMPTY');
	}

	const { document } = parseHTML(markup);
	const templateElement = assertSingleTemplateRoot(document);
	assertNoScriptTags(templateElement.content);
	const formElement = assertSingleDialogForm(templateElement);
	assertRequiredHooks(formElement);

	return true;
};
