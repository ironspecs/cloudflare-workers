export const createEmbedScript = () => `
(() => {
	const BACKDROP_FADE_DURATION_MS = 240;
	const DIALOG_FADE_DURATION_MS = 120;
	const SUCCESS_TRANSITION_DURATION_MS = BACKDROP_FADE_DURATION_MS;
	const SUCCESS_DISPLAY_DURATION_MS = 2000;
	const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	const HOOKS = {
		close: '[data-newsletters-close]',
		email: '[data-newsletters-email]',
		error: '[data-newsletters-error]',
		personName: '[data-newsletters-person-name]',
		success: '[data-newsletters-success]',
		successContent: '[data-newsletters-success-content]',
		submit: '[data-newsletters-submit]',
		turnstile: '[data-newsletters-turnstile]',
	};
	const scriptSource = document.currentScript?.src ?? '';
	let turnstileReady;

	const createError = (message) => new Error(message);
	const wait = (durationMs) => new Promise((resolve) => window.setTimeout(resolve, durationMs));

	if (!scriptSource) {
		throw createError('INVALID_SCRIPT_SOURCE');
	}

	const scriptUrl = new URL(scriptSource);
	const requestedMode = scriptUrl.searchParams.get('mode') === 'demo' ? 'demo' : 'live';
	const requestedTemplateName = scriptUrl.searchParams.get('template') || '';
	const serviceOrigin = scriptUrl.origin;
	const requestQuery = requestedMode === 'demo' ? '?mode=demo' : '';
	const queuedOpenCalls =
		window.Newsletters &&
		typeof window.Newsletters.open === 'function' &&
		Array.isArray(window.Newsletters.open.q)
			? window.Newsletters.open.q.slice()
			: [];

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
		dialog.setAttribute(
			'style',
			[
				'padding:0',
				'border:0',
				'background:transparent',
				'max-width:none',
				'width:100%',
				'height:100%',
				'margin:0',
			].join(';'),
		);
		document.body.appendChild(dialog);

		const shell = document.createElement('div');
		shell.setAttribute(
			'style',
			[
				'box-sizing:border-box',
				'display:flex',
				'align-items:center',
				'justify-content:center',
				'width:100%',
				'height:100%',
				'padding:24px',
				'background:rgba(15,23,42,0.48)',
			].join(';'),
		);
		dialog.appendChild(shell);

		return {
			dialog,
			shell,
		};
	};

	const destroyDialogShell = (dialog) => {
		if (dialog.open) {
			dialog.close();
		}

		dialog.remove();
	};

	const animateElement = (element, keyframes, options) =>
		new Promise((resolve) => {
			const animation = element.animate(keyframes, {
				fill: 'forwards',
				...options,
			});
			const complete = () => resolve(undefined);
			animation.addEventListener('cancel', complete, { once: true });
			animation.addEventListener('finish', complete, { once: true });
		});

	const playDialogEnterAnimation = (view) => {
		view.shell.style.background = 'rgba(15,23,42,0)';
		view.content.style.opacity = '0';

		return Promise.all([
			animateElement(
				view.shell,
				[{ background: 'rgba(15,23,42,0)' }, { background: 'rgba(15,23,42,0.48)' }],
				{ duration: BACKDROP_FADE_DURATION_MS, easing: 'ease' },
			),
			animateElement(view.content, [{ opacity: 0 }, { opacity: 1 }], {
				duration: DIALOG_FADE_DURATION_MS,
				easing: 'ease-out',
			}),
		]);
	};

	const playDialogExitAnimation = (view, content) => {
		return Promise.all([
			animateElement(
				view.shell,
				[{ background: 'rgba(15,23,42,0.48)' }, { background: 'rgba(15,23,42,0)' }],
				{ duration: BACKDROP_FADE_DURATION_MS, easing: 'ease' },
			),
			animateElement(content, [{ opacity: 1 }, { opacity: 0 }], {
				duration: DIALOG_FADE_DURATION_MS,
				easing: 'ease-in',
			}),
		]);
	};

	const lockPageScroll = () => {
		const body = document.body;
		const previousOverflow = body.style.overflow;
		const previousPaddingRight = body.style.paddingRight;
		const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0);

		body.style.overflow = 'hidden';
		if (scrollbarWidth > 0) {
			body.style.paddingRight = String(scrollbarWidth) + 'px';
		}

		return () => {
			body.style.overflow = previousOverflow;
			body.style.paddingRight = previousPaddingRight;
		};
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

	const getElements = (root, selector) => Array.from(root.querySelectorAll(selector)).filter((element) => element instanceof HTMLElement);

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
			<form
				method="dialog"
				style="display:flex;flex-direction:column;gap:16px;width:min(100%,420px);padding:24px;border:1px solid #d1d5db;border-radius:20px;background:#ffffff;box-shadow:0 24px 64px rgba(15,23,42,0.18);"
			>
				<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
					<h2 style="margin:0;font-size:1.25rem;line-height:1.75rem;">Join the newsletter</h2>
					<button type="button" data-newsletters-close style="border:0;background:transparent;font:inherit;cursor:pointer;">Close</button>
				</div>
				<label style="display:flex;flex-direction:column;gap:8px;">
					<span>Email</span>
					<input
						data-newsletters-email
						type="email"
						required
						style="display:block;width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;"
					/>
				</label>
				<label style="display:flex;flex-direction:column;gap:8px;">
					<span>Name</span>
					<input
						data-newsletters-person-name
						type="text"
						style="display:block;width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;"
					/>
				</label>
				<div style="padding:16px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
					<div data-newsletters-turnstile></div>
				</div>
				<p data-newsletters-error style="color:#b91c1c;margin:0;min-height:1.5rem;"></p>
				<div style="display:flex;gap:8px;justify-content:flex-end;">
					<button type="button" data-newsletters-close>Close</button>
					<button type="submit" data-newsletters-submit>Submit</button>
				</div>
			</form>
		\`;
		return wrapper.firstElementChild;
	};

	const ensureSuccessState = (form) => {
		let successContent = getSingleElement(form, HOOKS.successContent, 'INVALID_TEMPLATE_SUCCESS_CONTENT', false);
		let successOverlay = getSingleElement(form, HOOKS.success, 'INVALID_TEMPLATE_SUCCESS', false);

		if (!(successContent instanceof HTMLElement)) {
			const generatedContent = document.createElement('div');
			generatedContent.setAttribute('style', 'display:flex;flex-direction:column;');
			while (form.firstChild) {
				generatedContent.appendChild(form.firstChild);
			}
			form.appendChild(generatedContent);
			successContent = generatedContent;
		}

		if (!(successOverlay instanceof HTMLElement)) {
			const generatedOverlay = document.createElement('div');
			generatedOverlay.setAttribute(
				'style',
				[
					'position:absolute',
					'inset:0',
					'display:flex',
					'align-items:center',
					'justify-content:center',
					'flex-direction:column',
					'gap:8px',
					'padding:24px',
					'opacity:0',
					'pointer-events:none',
				].join(';'),
			);
			const generatedEmoji = document.createElement('p');
			generatedEmoji.textContent = '✅';
			generatedEmoji.setAttribute('style', ['margin:0', 'line-height:1'].join(';'));
			const generatedMessage = document.createElement('p');
			generatedMessage.textContent = 'Subscribed!';
			generatedMessage.setAttribute(
				'style',
				['margin:0', 'font-size:1.25rem', 'line-height:1.75rem', 'font-weight:600', 'color:inherit'].join(';'),
			);
			generatedOverlay.appendChild(generatedEmoji);
			generatedOverlay.appendChild(generatedMessage);
			form.appendChild(generatedOverlay);
			successOverlay = generatedOverlay;
		}

		if (!form.style.position) {
			form.style.position = 'relative';
		}

		successOverlay.setAttribute('aria-hidden', 'true');
		successOverlay.style.opacity = '0';
		successOverlay.style.pointerEvents = 'none';

		return {
			successContent: assertElement(successContent, 'INVALID_TEMPLATE_SUCCESS_CONTENT'),
			successOverlay: assertElement(successOverlay, 'INVALID_TEMPLATE_SUCCESS'),
		};
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

		return {
			content: root,
			form,
		};
	};

	const createDialogView = (templateMarkup) => {
		const { dialog, shell } = createDialogShell();
		let contentView;
		if (typeof templateMarkup === 'string' && templateMarkup.length > 0) {
			contentView = createServerTemplateDialogContent(templateMarkup);
		} else {
			const defaultDialogContent = createDefaultDialogContent();
			contentView = { content: defaultDialogContent, form: defaultDialogContent };
		}
		const { content, form } = contentView;
		const { successContent, successOverlay } = ensureSuccessState(form);
		shell.appendChild(content);

		return {
			closeTriggers: getElements(form, HOOKS.close),
			content,
			dialog,
			emailInput: assertTextInput(getSingleElement(form, HOOKS.email, 'INVALID_TEMPLATE_EMAIL'), 'INVALID_TEMPLATE_EMAIL'),
			errorElement: assertElement(getSingleElement(form, HOOKS.error, 'INVALID_TEMPLATE_ERROR'), 'INVALID_TEMPLATE_ERROR'),
			form,
			personNameInput: assertTextInput(
				getSingleElement(form, HOOKS.personName, 'INVALID_TEMPLATE_PERSON_NAME', false),
				'INVALID_TEMPLATE_PERSON_NAME',
				false,
			),
			shell,
			successContent,
			successOverlay,
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
		const response = await fetch(\`\${serviceOrigin}/newsletters/session\${requestQuery}\`, {
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

		const subscribeUrl = \`\${serviceOrigin}/subscribe\${requestQuery}\`;
		const response = await fetch(subscribeUrl, {
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

	const reportHighLevelError = (error) => {
		console.error('[Newsletters]', error instanceof Error ? error.message : String(error));
	};

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

		const onCloseTriggerClick = () => view.dialog.close();
		const unlockScroll = lockPageScroll();
		const onShellClick = (event) => {
			if (event.target === view.shell) {
				view.dialog.close();
			}
		};

		return new Promise((resolve) => {
			let activeContent = view.content;
			let isClosing = false;
			let isSubmitting = false;

			const closeDialog = async () => {
				if (isClosing) {
					return;
				}

				isClosing = true;
				await playDialogExitAnimation(view, activeContent);
				view.dialog.close();
			};

			const onCloseTriggerClick = (event) => {
				event.preventDefault();
				void closeDialog();
			};

			const onShellClick = (event) => {
				if (event.target === view.shell) {
					void closeDialog();
				}
			};

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
				for (const closeTrigger of view.closeTriggers) {
					closeTrigger.removeEventListener('click', onCloseTriggerClick);
				}
				view.shell.removeEventListener('click', onShellClick);
				view.dialog.removeEventListener('close', onClose);
				unlockScroll();
				destroyDialogShell(view.dialog);
			};

			const onClose = () => {
				cleanup();
				resolve(undefined);
			};

			const onSubmit = async (event) => {
				event.preventDefault();
				if (isSubmitting || isClosing) {
					return;
				}

				isSubmitting = true;

				try {
					const turnstileToken = turnstileControl.getToken();
					if (!turnstileToken) {
						view.errorElement.textContent = 'TURNSTILE_NOT_READY';
						isSubmitting = false;
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
						isSubmitting = false;
						return;
					}

					view.successOverlay.setAttribute('aria-hidden', 'false');
					await Promise.all([
						animateElement(view.successContent, [{ opacity: 1 }, { opacity: 0 }], {
							duration: SUCCESS_TRANSITION_DURATION_MS,
							easing: 'ease-in',
							fill: 'forwards',
						}),
						animateElement(view.successOverlay, [{ opacity: 0 }, { opacity: 1 }], {
							duration: SUCCESS_TRANSITION_DURATION_MS,
							easing: 'ease-out',
							fill: 'forwards',
						}),
					]);
					await wait(SUCCESS_DISPLAY_DURATION_MS);
					await closeDialog();
				} catch (submitError) {
					view.errorElement.textContent = submitError instanceof Error ? submitError.message : String(submitError);
					turnstileControl.reset();
					isSubmitting = false;
				}
			};

			for (const closeTrigger of view.closeTriggers) {
				closeTrigger.addEventListener('click', onCloseTriggerClick);
			}
			view.shell.addEventListener('click', onShellClick);
			view.form.addEventListener('submit', onSubmit);
			view.submitTrigger.addEventListener('click', onSubmitTriggerClick);
			view.dialog.addEventListener('close', onClose, { once: true });
			view.dialog.showModal();
			void playDialogEnterAnimation(view);
		});
	};

	const realApi = {
		createSession: async ({ action = 'subscribe', listName = '' } = {}) => {
			return requestSession({ action, listName });
		},
		open: ({ listName = '', personName = '' } = {}) => {
			void openDialog({ listName, personName }).catch(reportHighLevelError);
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

	window.Newsletters = realApi;

	if (queuedOpenCalls.length > 0) {
		Promise.resolve().then(() => {
			for (const options of queuedOpenCalls) {
				realApi.open(options);
			}
		});
	}
})();
`;
