export const createEmbedScript = () => `
(() => {
	const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	const dialogId = 'newsletters-dialog';
	const turnstileContainerId = 'newsletters-turnstile';
	const scriptSource = document.currentScript?.src ?? '';
	const serviceOrigin = new URL(scriptSource, window.location.href).origin;
	let turnstileReady;

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
				script.onerror = () => reject(new Error('Unable to load Turnstile'));
				document.head.appendChild(script);
			});
		}

		return turnstileReady;
	};

	const ensureDialog = () => {
		let dialog = document.getElementById(dialogId);
		if (dialog) {
			return dialog;
		}

		dialog = document.createElement('dialog');
		dialog.id = dialogId;
		dialog.innerHTML = \`
			<form method="dialog" style="display:flex;flex-direction:column;gap:12px;min-width:320px;padding:24px;">
				<label>
					Email
					<input name="email" type="email" required style="display:block;width:100%;margin-top:8px;" />
				</label>
				<label>
					Name
					<input name="person_name" type="text" style="display:block;width:100%;margin-top:8px;" />
				</label>
				<div id="\${turnstileContainerId}"></div>
				<p id="newsletters-error" style="color:#b91c1c;margin:0;"></p>
				<div style="display:flex;gap:8px;justify-content:flex-end;">
					<button type="button" data-close>Close</button>
					<button type="submit">Submit</button>
				</div>
			</form>
		\`;
		dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
		document.body.appendChild(dialog);
		return dialog;
	};

	const requestSession = async (listName) => {
		const response = await fetch(\`\${serviceOrigin}/newsletters/session\`, {
			body: JSON.stringify({
				action: 'subscribe',
				list_name: listName ?? '',
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		});

		const payload = await response.json();
		if (!response.ok || !payload.success) {
			throw new Error(payload.error || 'Unable to start newsletters session');
		}

		return payload.value;
	};

	const submitSubscription = async (context, values) => {
		const response = await fetch(\`\${serviceOrigin}/subscribe\`, {
			body: JSON.stringify({
				email: values.email,
				hostname: window.location.hostname,
				list_name: context.listName,
				person_name: values.personName || undefined,
				turnstile_token: values.turnstileToken,
			}),
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-Token': context.csrfToken,
				'X-Session-Id': context.sessionId,
			},
			method: 'POST',
		});

		return response.json();
	};

	const renderTurnstile = async (siteKey) => {
		const turnstile = await ensureTurnstile();
		let currentToken = '';
		const turnstileId = turnstile.render(\`#\${turnstileContainerId}\`, {
			callback: (token) => {
				currentToken = token;
			},
			sitekey: siteKey,
		});

		return {
			getToken: () => currentToken || turnstile.getResponse(turnstileId),
			remove: () => turnstile.remove(turnstileId),
			reset: () => turnstile.reset(turnstileId),
		};
	};

	window.Newsletters = {
		open: async ({ listName = '', personName = '' } = {}) => {
			const session = await requestSession(listName);
			const dialog = ensureDialog();
			const form = dialog.querySelector('form');
			const error = dialog.querySelector('#newsletters-error');
			const personNameInput = form.elements.namedItem('person_name');
			const emailInput = form.elements.namedItem('email');
			personNameInput.value = personName;
			error.textContent = '';

			const turnstileControl = await renderTurnstile(session.siteKey);
			dialog.showModal();

			const result = await new Promise((resolve, reject) => {
				const cleanup = () => {
					turnstileControl.remove();
					form.removeEventListener('submit', onSubmit);
					dialog.removeEventListener('close', onClose);
				};

				const onClose = () => {
					cleanup();
					resolve({ error: 'DIALOG_CLOSED', success: false });
				};

				const onSubmit = async (event) => {
					event.preventDefault();

					try {
						const payload = await submitSubscription(
							{
								csrfToken: session.csrfToken,
								listName,
								sessionId: session.sessionId,
							},
							{
								email: emailInput.value,
								personName: personNameInput.value,
								turnstileToken: turnstileControl.getToken(),
							},
						);

						if (!payload.success) {
							error.textContent = payload.error;
							turnstileControl.reset();
							return;
						}

						cleanup();
						dialog.close();
						resolve(payload);
					} catch (submitError) {
						cleanup();
						reject(submitError);
					}
				};

				form.addEventListener('submit', onSubmit);
				dialog.addEventListener('close', onClose, { once: true });
			});

			return result;
		},
	};
})();
`;
