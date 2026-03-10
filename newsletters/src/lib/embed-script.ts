export const createEmbedScript = () => `
(() => {
	const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	const HOOKS = {
		close: '[data-newsletters-close]',
		email: '[data-newsletters-email]',
		error: '[data-newsletters-error]',
		personName: '[data-newsletters-person-name]',
		submit: '[data-newsletters-submit]',
		turnstile: '[data-newsletters-turnstile]',
	};
	const scriptSource = document.currentScript?.src ?? '';
	let turnstileReady;

	const createError = (message) => new Error(message);

	if (!scriptSource) {
		throw createError('INVALID_SCRIPT_SOURCE');
	}

	const scriptUrl = new URL(scriptSource);
	const requestedTemplateName = scriptUrl.searchParams.get('template') || '';
	const serviceOrigin = scriptUrl.origin;

	const ensureTurnstile = () => {
		if (window.turnstile) {
			return Promise.resolve(window.turnstile);
		}

		if (!turnstileReady) {
			turnstileReady = new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.async = true;
				script.defer = true;
				script.src = TURNSTILE_URL;
				script.onload = () => resolve(window.turnstile);
				script.onerror = () => reject(createError('Unable to load Turnstile'));
				document.head.appendChild(script);
			});
		}

		return turnstileReady;
	};

	const getContainerElement = (container) => {
		if (typeof container === 'string') {
			const element = document.querySelector(container);
			if (!(element instanceof HTMLElement)) {
				throw createError('INVALID_TURNSTILE_CONTAINER');
			}

			return element;
		}

		if (!(container instanceof HTMLElement)) {
			throw createError('INVALID_TURNSTILE_CONTAINER');
		}

		return container;
	};

	const createDialogShell = () => {
		const dialog = document.createElement('dialog');
		dialog.dataset.newslettersManaged = 'true';
		document.body.appendChild(dialog);
		return dialog;
	};

	const destroyDialogShell = (dialog) => {
		if (dialog.open) {
			dialog.close();
		}

		dialog.remove();
	};

	const getSingleElement = (root, selector, errorCode, required = true) => {
		const matches = root.querySelectorAll(selector);
		if (matches.length === 0) {
			if (!required) {
				return null;
			}

			throw createError(errorCode);
		}

		if (matches.length > 1) {
			throw createError(errorCode);
		}

		return matches[0];
	};

	const assertTextInput = (element, errorCode, required = true) => {
		if (element === null) {
			if (!required) {
				return null;
			}

			throw createError(errorCode);
		}

		if (!(element instanceof HTMLInputElement)) {
			throw createError(errorCode);
		}

		return element;
	};

	const assertElement = (element, errorCode) => {
		if (!(element instanceof HTMLElement)) {
			throw createError(errorCode);
		}

		return element;
	};

	const createDefaultDialogContent = () => {
		const wrapper = document.createElement('div');
		wrapper.innerHTML = \`
			<form method="dialog" style="display:flex;flex-direction:column;gap:12px;min-width:320px;padding:24px;">
				<label>
					Email
					<input data-newsletters-email type="email" required style="display:block;width:100%;margin-top:8px;" />
				</label>
				<label>
					Name
					<input data-newsletters-person-name type="text" style="display:block;width:100%;margin-top:8px;" />
				</label>
				<div data-newsletters-turnstile></div>
				<p data-newsletters-error style="color:#b91c1c;margin:0;"></p>
				<div style="display:flex;gap:8px;justify-content:flex-end;">
					<button type="button" data-newsletters-close>Close</button>
					<button type="submit" data-newsletters-submit>Submit</button>
				</div>
			</form>
		\`;
		return wrapper.firstElementChild;
	};

	const createTemplateMarkupRoot = (markup) => {
		const wrapper = document.createElement('div');
		wrapper.innerHTML = markup.trim();
		if (wrapper.firstElementChild instanceof HTMLTemplateElement) {
			const templateWrapper = document.createElement('div');
			templateWrapper.appendChild(wrapper.firstElementChild.content.cloneNode(true));
			return templateWrapper;
		}

		return wrapper;
	};

	const createServerTemplateDialogContent = (markup) => {
		const root = createTemplateMarkupRoot(markup);
		const form = root.querySelector('form');
		if (!(form instanceof HTMLFormElement)) {
			throw createError('INVALID_TEMPLATE_FORM');
		}

		return form;
	};

	const createDialogView = (templateMarkup) => {
		const dialog = createDialogShell();
		const form = typeof templateMarkup === 'string' && templateMarkup.length > 0 ? createServerTemplateDialogContent(templateMarkup) : createDefaultDialogContent();
		dialog.appendChild(form);

		return {
			closeTrigger: getSingleElement(form, HOOKS.close, 'INVALID_TEMPLATE_CLOSE', false),
			dialog,
			emailInput: assertTextInput(getSingleElement(form, HOOKS.email, 'INVALID_TEMPLATE_EMAIL'), 'INVALID_TEMPLATE_EMAIL'),
			errorElement: assertElement(getSingleElement(form, HOOKS.error, 'INVALID_TEMPLATE_ERROR'), 'INVALID_TEMPLATE_ERROR'),
			form,
			personNameInput: assertTextInput(
				getSingleElement(form, HOOKS.personName, 'INVALID_TEMPLATE_PERSON_NAME', false),
				'INVALID_TEMPLATE_PERSON_NAME',
				false,
			),
			submitTrigger: assertElement(getSingleElement(form, HOOKS.submit, 'INVALID_TEMPLATE_SUBMIT'), 'INVALID_TEMPLATE_SUBMIT'),
			turnstileContainer: assertElement(
				getSingleElement(form, HOOKS.turnstile, 'INVALID_TEMPLATE_TURNSTILE'),
				'INVALID_TEMPLATE_TURNSTILE',
			),
		};
	};

	const shouldInterceptSubmitClick = (submitTrigger) => {
		if (submitTrigger instanceof HTMLInputElement) {
			return submitTrigger.type !== 'submit';
		}

		if (submitTrigger instanceof HTMLButtonElement) {
			return submitTrigger.type !== 'submit';
		}

		return true;
	};

	const parseJsonResponse = async (response) => {
		const text = await response.text();
		try {
			return text ? JSON.parse(text) : {};
		} catch {
			throw createError('INVALID_SERVICE_RESPONSE');
		}
	};

	const requestSession = async ({ action = 'subscribe', listName = '' } = {}) => {
		const response = await fetch(\`\${serviceOrigin}/newsletters/session\`, {
			body: JSON.stringify({
				action,
				list_name: listName,
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		});
		const payload = await parseJsonResponse(response);
		if (!response.ok || !payload.success) {
			throw createError(payload.error || 'Unable to start newsletters session');
		}

		return payload.value;
	};

	const fetchTemplateMarkup = async (name) => {
		const response = await fetch(\`\${serviceOrigin}/newsletters/templates/\${encodeURIComponent(name)}\`);
		const payload = await parseJsonResponse(response);
		if (!response.ok || !payload.success || typeof payload.value?.markup !== 'string') {
			throw createError(payload.error || 'INVALID_TEMPLATE_RESPONSE');
		}

		return payload.value.markup;
	};

	const createRequestedTemplateState = (name) => {
		if (!name) {
			return null;
		}

		const state = {
			error: null,
			markup: '',
			promise: Promise.resolve(),
		};
		state.promise = fetchTemplateMarkup(name)
			.then((markup) => {
				state.markup = markup;
			})
			.catch((error) => {
				state.error = error instanceof Error ? error : createError(String(error));
			});
		return state;
	};

	const requestedTemplateState = createRequestedTemplateState(requestedTemplateName);

	const getRequestedTemplateMarkup = async () => {
		if (!requestedTemplateState) {
			return null;
		}

		if (requestedTemplateState.markup) {
			return requestedTemplateState.markup;
		}

		await requestedTemplateState.promise;
		if (requestedTemplateState.error) {
			throw requestedTemplateState.error;
		}

		if (!requestedTemplateState.markup) {
			throw createError('INVALID_TEMPLATE_RESPONSE');
		}

		return requestedTemplateState.markup;
	};

	const submitSubscription = async ({
		email,
		hostname = window.location.hostname,
		listName = '',
		personName,
		submitToken,
		turnstileToken,
	}) => {
		if (!submitToken) {
			throw createError('INVALID_SUBMIT_TOKEN');
		}

		if (!turnstileToken) {
			throw createError('TURNSTILE_NOT_READY');
		}

		const response = await fetch(\`\${serviceOrigin}/subscribe\`, {
			body: JSON.stringify({
				email,
				hostname,
				list_name: listName,
				person_name: personName || undefined,
				turnstile_token: turnstileToken,
			}),
			headers: {
				'Content-Type': 'application/json',
				'X-Submit-Token': submitToken,
			},
			method: 'POST',
		});

		return parseJsonResponse(response);
	};

	const renderTurnstile = async (container, { siteKey }) => {
		const target = getContainerElement(container);
		const turnstile = await ensureTurnstile();
		target.replaceChildren();
		let currentToken = '';
		const turnstileId = turnstile.render(target, {
			callback: (token) => {
				currentToken = token;
			},
			sitekey: siteKey,
		});

		return {
			getToken: () => currentToken || turnstile.getResponse(turnstileId),
			remove: () => turnstile.remove(turnstileId),
			reset: () => {
				currentToken = '';
				turnstile.reset(turnstileId);
			},
		};
	};

	const toFailureResult = (error) => ({
		error: error instanceof Error ? error.message : String(error),
		success: false,
	});

	const openDialog = async ({ listName = '', personName = '' } = {}) => {
		const [session, templateMarkup] = await Promise.all([
			requestSession({
				action: 'subscribe',
				listName,
			}),
			getRequestedTemplateMarkup(),
		]);
		const view = createDialogView(templateMarkup);
		const turnstileControl = await renderTurnstile(view.turnstileContainer, {
			siteKey: session.siteKey,
		});
		view.errorElement.textContent = '';
		if (view.personNameInput instanceof HTMLInputElement) {
			view.personNameInput.value = personName;
		}

		if (view.closeTrigger instanceof HTMLElement) {
			view.closeTrigger.addEventListener('click', () => view.dialog.close());
		}

		view.dialog.showModal();

		return new Promise((resolve) => {
			const onSubmitTriggerClick = (event) => {
				if (!shouldInterceptSubmitClick(view.submitTrigger)) {
					return;
				}

				event.preventDefault();
				view.form.requestSubmit();
			};

			const cleanup = () => {
				turnstileControl.remove();
				view.form.removeEventListener('submit', onSubmit);
				view.submitTrigger.removeEventListener('click', onSubmitTriggerClick);
				view.dialog.removeEventListener('close', onClose);
				destroyDialogShell(view.dialog);
			};

			const onClose = () => {
				cleanup();
				resolve({ error: 'DIALOG_CLOSED', success: false });
			};

			const onSubmit = async (event) => {
				event.preventDefault();

				try {
					const turnstileToken = turnstileControl.getToken();
					if (!turnstileToken) {
						view.errorElement.textContent = 'TURNSTILE_NOT_READY';
						return;
					}

					const payload = await submitSubscription({
						email: view.emailInput.value,
						listName,
						personName: view.personNameInput instanceof HTMLInputElement ? view.personNameInput.value : '',
						submitToken: session.submitToken,
						turnstileToken,
					});

					if (!payload.success) {
						view.errorElement.textContent = payload.error;
						turnstileControl.reset();
						return;
					}

					cleanup();
					resolve(payload);
				} catch (submitError) {
					cleanup();
					resolve(toFailureResult(submitError));
				}
			};

			view.form.addEventListener('submit', onSubmit);
			view.submitTrigger.addEventListener('click', onSubmitTriggerClick);
			view.dialog.addEventListener('close', onClose, { once: true });
		});
	};

	window.Newsletters = {
		createSession: async ({ action = 'subscribe', listName = '' } = {}) => {
			return requestSession({ action, listName });
		},
		open: async ({ listName = '', personName = '' } = {}) => {
			try {
				return await openDialog({ listName, personName });
			} catch (error) {
				return toFailureResult(error);
			}
		},
		renderTurnstile: async (container, { siteKey }) => {
			return renderTurnstile(container, { siteKey });
		},
		subscribe: async ({ email, hostname, listName = '', personName = '', submitToken, turnstileToken }) => {
			return submitSubscription({
				email,
				hostname,
				listName,
				personName,
				submitToken,
				turnstileToken,
			});
		},
	};
})();
`;
