import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(__dirname, '..');
const wranglerBin = resolve(workspaceDir, '../node_modules/wrangler/bin/wrangler.js');
const turnstileTestToken = 'XXXX.DUMMY.TOKEN.XXXX';
const testHostname = 'example.com';
const localOriginHostname = '127.0.0.1';
const testTurnstileSiteKey = '1x00000000000000000000AA';
const testDekKekId = 'kek202603101900';
const testJwksKid = 'test-rs256-key';
const ownedTemplateName = 'example-owned';
const testKeksJson = JSON.stringify({
	active_id: testDekKekId,
	keys: {
		[testDekKekId]: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
	},
});
const testDekWrapped = 'v1.U+JvHS9wSuC747CG.MhLYqrtoU3looBKOyyjGeAf2/7GlXB6uuQ5o66oD5k44Zux2O3e4Z2tOfXDbivXOFPSi6ds/S082vxSK';
const testTurnstileSecretCiphertext = 'v1.DkN/GUS12go12qyj.AZJae9HJFXg5IS57zL6bngrN88JWH2uytYp+sSNwMt/BYQfknlbcY/JHCUC6YBnRgm+Z';
const starterTemplatePath = resolve(workspaceDir, 'examples/templates/starter-dialog.html');
const daisyuiTemplatePath = resolve(workspaceDir, 'examples/templates/tailwind-daisyui-dialog.html');
const toBase64Url = (value) => Buffer.from(value).toString('base64url');
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

const createOwnedTemplateMarkup = (title) =>
	`
<form method="dialog">
	<label>
		Email
		<input data-newsletters-email type="email" required />
	</label>
	<label>
		Name
		<input data-newsletters-person-name type="text" value="${title}" />
	</label>
	<div data-newsletters-turnstile></div>
	<p data-newsletters-error></p>
	<div>
		<button data-newsletters-close type="button">Cancel</button>
		<button data-newsletters-submit type="submit">Join</button>
	</div>
</form>
`.trim();

const createSignedJwt = (privateKey, payload) => {
	const header = {
		alg: 'RS256',
		kid: testJwksKid,
		typ: 'JWT',
	};
	const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
	const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey).toString('base64url');
	return `${signingInput}.${signature}`;
};

const createJwksServer = async () => {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	const publicJwk = publicKey.export({ format: 'jwk' });
	const jwksPayload = JSON.stringify({
		keys: [
			{
				...publicJwk,
				alg: 'RS256',
				kid: testJwksKid,
				use: 'sig',
			},
		],
	});
	const server = http.createServer((request, response) => {
		if (request.url !== '/.well-known/jwks.json') {
			response.writeHead(404);
			response.end();
			return;
		}

		response.writeHead(200, {
			'cache-control': 'public, max-age=60',
			'content-type': 'application/json',
		});
		response.end(jwksPayload);
	});

	await new Promise((resolveListen, rejectListen) => {
		server.once('error', rejectListen);
		server.listen(0, '127.0.0.1', () => resolveListen(undefined));
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Unable to start JWKS server');
	}

	return {
		close: () =>
			new Promise((resolveClose) => {
				server.close(() => resolveClose(undefined));
			}),
		createToken: (payload) => createSignedJwt(privateKey, payload),
		jwksUrl: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
	};
};

const assertSubscriptionCount = async (stateDir, expectedCount) => {
	const { stdout } = await runCommand(
		[
			wranglerBin,
			'd1',
			'execute',
			'NewslettersD1',
			'--local',
			'--persist-to',
			stateDir,
			'--json',
			'--command',
			'SELECT COUNT(*) AS count FROM subscription;',
		],
		workspaceDir,
	);
	const [{ results }] = JSON.parse(stdout);
	assert.equal(results[0].count, expectedCount);
};

const parseJsonResponse = async (response) => {
	const text = await response.text();
	return {
		payload: text ? JSON.parse(text) : null,
		status: response.status,
	};
};

const getAvailablePort = () =>
	new Promise((resolvePort, reject) => {
		const server = net.createServer();
		server.listen(0, () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Unable to allocate a port'));
				return;
			}

			server.close(() => resolvePort(address.port));
		});
		server.on('error', reject);
	});

const runCommand = (args, cwd) =>
	new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) {
				resolveRun({ stdout, stderr });
				return;
			}

			reject(new Error(`Command failed (${code}): ${args.join(' ')}\n${stderr || stdout}`));
		});
	});

const waitForServer = async (url, child) => {
	/** @type {string[]} */
	const stderr = [];
	child.stderr.on('data', (chunk) => {
		stderr.push(chunk.toString());
	});

	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (child.exitCode !== null) {
			throw new Error(`wrangler dev exited early:\n${stderr.join('')}`);
		}

		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {}

		await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
	}

	throw new Error(`Timed out waiting for ${url}\n${stderr.join('')}`);
};

const main = async () => {
	const stateDir = await mkdtemp(join(tmpdir(), 'newsletters-wrangler-'));
	const envFilePath = join(stateDir, '.dev.vars');
	const port = await getAvailablePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const jwksServer = await createJwksServer();

	try {
		await writeFile(envFilePath, `HOSTNAME_CONFIG_KEKS_JSON=${testKeksJson}\n`, 'utf8');

		await runCommand(
			[wranglerBin, 'd1', 'execute', 'NewslettersD1', '--local', '--persist-to', stateDir, '--file', './src/schema.sql'],
			workspaceDir,
		);

		await runCommand(
			[
				wranglerBin,
				'd1',
				'execute',
				'NewslettersD1',
				'--local',
				'--persist-to',
				stateDir,
				'--command',
				`INSERT INTO hostname_config (hostname, jwks_url, turnstile_site_key) VALUES ('${testHostname}', '${jwksServer.jwksUrl}', '${testTurnstileSiteKey}');`,
			],
			workspaceDir,
		);

		await runCommand(
			[
				wranglerBin,
				'd1',
				'execute',
				'NewslettersD1',
				'--local',
				'--persist-to',
				stateDir,
				'--command',
				`INSERT INTO hostname_config (hostname, jwks_url, turnstile_site_key) VALUES ('localhost', NULL, NULL), ('${localOriginHostname}', NULL, NULL);`,
			],
			workspaceDir,
		);

		await runCommand(
			[
				wranglerBin,
				'd1',
				'execute',
				'NewslettersD1',
				'--local',
				'--persist-to',
				stateDir,
				'--command',
				`INSERT INTO hostname_config_secrets (hostname, dek_kek_id, dek_wrapped, turnstile_secret_key_ciphertext) VALUES ('${testHostname}', '${testDekKekId}', '${testDekWrapped}', '${testTurnstileSecretCiphertext}');`,
			],
			workspaceDir,
		);

		const starterTemplateMarkup = await readFile(starterTemplatePath, 'utf8');
		const daisyuiTemplateMarkup = await readFile(daisyuiTemplatePath, 'utf8');
		await runCommand(
			[
				wranglerBin,
				'd1',
				'execute',
				'NewslettersD1',
				'--local',
				'--persist-to',
				stateDir,
				'--command',
				`INSERT INTO newsletter_template (name, hostname, markup, created_at, updated_at) VALUES (${sqlString('starter')}, NULL, ${sqlString(starterTemplateMarkup)}, 1, 1), (${sqlString('daisyui')}, NULL, ${sqlString(daisyuiTemplateMarkup)}, 1, 1);`,
			],
			workspaceDir,
		);

		const devServer = spawn(
			process.execPath,
			[
				wranglerBin,
				'dev',
				'--env-file',
				envFilePath,
				'--local',
				'--persist-to',
				stateDir,
				'--port',
				String(port),
				'--log-level',
				'error',
				'--show-interactive-dev-session=false',
			],
			{
				cwd: workspaceDir,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		try {
			await waitForServer(`${baseUrl}/`, devServer);

			const homepage = await fetch(`${baseUrl}/`);
			assert.equal(homepage.status, 200);
			const homepageHtml = await homepage.text();
			assert.match(homepageHtml, /One worker, two UI options/i);
			assert.match(homepageHtml, /newsletter-open-button/);
			assert.match(homepageHtml, /newsletter-sdk-form/);
			assert.match(homepageHtml, /newsletters\.js\?template=starter/);
			assert.match(homepageHtml, /window\.Newsletters\.createSession/);

			const newslettersScriptResponse = await fetch(`${baseUrl}/newsletters.js`);
			assert.equal(newslettersScriptResponse.status, 200);
			assert.match(newslettersScriptResponse.headers.get('content-type') ?? '', /application\/javascript/);
			const newslettersScript = await newslettersScriptResponse.text();
			assert.match(newslettersScript, /window\.Newsletters/);
			assert.match(newslettersScript, /createSession: async/);
			assert.match(newslettersScript, /renderTurnstile: async/);
			assert.match(newslettersScript, /subscribe: async/);
			assert.match(newslettersScript, /newsletters\/templates/);

			const templatedNewslettersScriptResponse = await fetch(`${baseUrl}/newsletters.js?template=starter`);
			assert.equal(templatedNewslettersScriptResponse.status, 200);
			const templatedNewslettersScript = await templatedNewslettersScriptResponse.text();
			assert.match(templatedNewslettersScript, /searchParams\.get\('template'\)/);

			const publicTemplateResponse = await fetch(`${baseUrl}/newsletters/templates/starter`, {
				headers: {
					origin: `https://${testHostname}`,
				},
			});
			assert.equal(publicTemplateResponse.status, 200);
			assert.equal(publicTemplateResponse.headers.get('access-control-allow-origin'), `https://${testHostname}`);
			assert.deepEqual(await publicTemplateResponse.json(), {
				success: true,
				value: {
					markup: starterTemplateMarkup,
					name: 'starter',
				},
			});

			const preflightResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'OPTIONS',
				headers: {
					origin: `https://${testHostname}`,
				},
			});
			assert.equal(preflightResponse.status, 204);
			assert.equal(preflightResponse.headers.get('access-control-allow-origin'), `https://${testHostname}`);
			assert.match(preflightResponse.headers.get('access-control-allow-headers') ?? '', /X-Submit-Token/);

			const sessionResponse = await fetch(`${baseUrl}/newsletters/session`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
				},
				body: JSON.stringify({
					action: 'subscribe',
					list_name: 'weekly',
				}),
			});
			assert.equal(sessionResponse.status, 200);
			const { payload: sessionPayload } = await parseJsonResponse(sessionResponse);
			assert.deepEqual(sessionPayload.success, true);
			assert.equal(typeof sessionPayload.value.submitToken, 'string');
			assert.equal(sessionPayload.value.siteKey, testTurnstileSiteKey);

			const apiToken = jwksServer.createToken({
				exp: Math.floor(Date.now() / 1000) + 300,
				sub: 'service-client',
			});
			const subscribersResponse = await fetch(`${baseUrl}/api/subscribers?hostname=${encodeURIComponent(testHostname)}`, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${apiToken}`,
				},
			});
			assert.equal(subscribersResponse.status, 200);
			assert.deepEqual(await subscribersResponse.json(), {
				success: true,
				value: {
					has_more: false,
					items: [],
					limit: 100,
					offset: 0,
				},
			});

			const emptyTemplatesResponse = await fetch(`${baseUrl}/api/templates?hostname=${encodeURIComponent(testHostname)}`, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${apiToken}`,
				},
			});
			assert.equal(emptyTemplatesResponse.status, 200);
			assert.deepEqual(await emptyTemplatesResponse.json(), {
				success: true,
				value: {
					items: [],
				},
			});

			const createTemplateResponse = await fetch(`${baseUrl}/api/templates`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${apiToken}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					hostname: testHostname,
					markup: createOwnedTemplateMarkup('Created'),
					name: ownedTemplateName,
				}),
			});
			assert.equal(createTemplateResponse.status, 201);
			const createdTemplatePayload = await createTemplateResponse.json();
			assert.equal(createdTemplatePayload.success, true);
			assert.equal(createdTemplatePayload.value.name, ownedTemplateName);
			assert.equal(createdTemplatePayload.value.hostname, testHostname);

			const ownedTemplatesResponse = await fetch(`${baseUrl}/api/templates?hostname=${encodeURIComponent(testHostname)}`, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${apiToken}`,
				},
			});
			assert.equal(ownedTemplatesResponse.status, 200);
			assert.deepEqual(await ownedTemplatesResponse.json(), {
				success: true,
				value: {
					items: [createdTemplatePayload.value],
				},
			});

			const ownedTemplateReadResponse = await fetch(
				`${baseUrl}/api/templates/${ownedTemplateName}?hostname=${encodeURIComponent(testHostname)}`,
				{
					method: 'GET',
					headers: {
						authorization: `Bearer ${apiToken}`,
					},
				},
			);
			assert.equal(ownedTemplateReadResponse.status, 200);
			assert.deepEqual(await ownedTemplateReadResponse.json(), {
				success: true,
				value: createdTemplatePayload.value,
			});

			const browserOwnedTemplateResponse = await fetch(`${baseUrl}/newsletters/templates/${ownedTemplateName}`, {
				headers: {
					origin: `https://${testHostname}`,
				},
			});
			assert.equal(browserOwnedTemplateResponse.status, 200);
			const browserOwnedTemplatePayload = await browserOwnedTemplateResponse.json();
			assert.equal(browserOwnedTemplatePayload.success, true);
			assert.equal(browserOwnedTemplatePayload.value.name, ownedTemplateName);

			const forbiddenOwnedTemplateResponse = await fetch(`${baseUrl}/newsletters/templates/${ownedTemplateName}`, {
				headers: {
					origin: `http://${localOriginHostname}:4173`,
				},
			});
			assert.equal(forbiddenOwnedTemplateResponse.status, 404);
			assert.deepEqual(await forbiddenOwnedTemplateResponse.json(), {
				error: 'NOT_FOUND',
				success: false,
			});

			const updateTemplateResponse = await fetch(`${baseUrl}/api/templates/${ownedTemplateName}`, {
				method: 'PATCH',
				headers: {
					authorization: `Bearer ${apiToken}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					hostname: testHostname,
					markup: createOwnedTemplateMarkup('Updated'),
				}),
			});
			assert.equal(updateTemplateResponse.status, 200);
			const updatedTemplatePayload = await updateTemplateResponse.json();
			assert.equal(updatedTemplatePayload.success, true);
			assert.match(updatedTemplatePayload.value.markup, /Updated/);

			const missingAuthorizationResponse = await fetch(`${baseUrl}/api/subscribers?hostname=${encodeURIComponent(testHostname)}`, {
				method: 'GET',
			});
			assert.equal(missingAuthorizationResponse.status, 401);
			assert.deepEqual(await missingAuthorizationResponse.json(), {
				error: 'INVALID_AUTHORIZATION',
				success: false,
			});

			const subscribeResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
					'x-submit-token': sessionPayload.value.submitToken,
				},
				body: JSON.stringify({
					email: 'person@softwarepatterns.com',
					hostname: testHostname,
					list_name: 'weekly',
					turnstile_token: turnstileTestToken,
				}),
			});
			assert.equal(subscribeResponse.status, 200);
			assert.deepEqual(await subscribeResponse.json(), {
				success: true,
				value: 'SUBSCRIBED',
			});
			await assertSubscriptionCount(stateDir, 1);

			const alreadySubscribedResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
					'x-submit-token': sessionPayload.value.submitToken,
				},
				body: JSON.stringify({
					email: 'person@softwarepatterns.com',
					hostname: testHostname,
					list_name: 'weekly',
					turnstile_token: turnstileTestToken,
				}),
			});
			assert.equal(alreadySubscribedResponse.status, 200);
			assert.deepEqual(await alreadySubscribedResponse.json(), {
				success: true,
				value: 'ALREADY_SUBSCRIBED',
			});

			const listedSubscribersResponse = await fetch(`${baseUrl}/api/subscribers?hostname=${encodeURIComponent(testHostname)}`, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${apiToken}`,
				},
			});
			assert.equal(listedSubscribersResponse.status, 200);
			const listedSubscribersPayload = await listedSubscribersResponse.json();
			assert.equal(listedSubscribersPayload.success, true);
			assert.equal(listedSubscribersPayload.value.items.length, 1);
			assert.equal(listedSubscribersPayload.value.items[0].email, 'person@softwarepatterns.com');
			assert.equal(listedSubscribersPayload.value.items[0].hostname, testHostname);

			const deleteSubscriberResponse = await fetch(
				`${baseUrl}/api/subscribers/${listedSubscribersPayload.value.items[0].id}?hostname=${encodeURIComponent(testHostname)}`,
				{
					method: 'DELETE',
					headers: {
						authorization: `Bearer ${apiToken}`,
					},
				},
			);
			assert.equal(deleteSubscriberResponse.status, 200);
			assert.deepEqual(await deleteSubscriberResponse.json(), {
				success: true,
				value: 'DELETED',
			});
			await assertSubscriptionCount(stateDir, 0);

			const missingDeleteResponse = await fetch(
				`${baseUrl}/api/subscribers/${listedSubscribersPayload.value.items[0].id}?hostname=${encodeURIComponent(testHostname)}`,
				{
					method: 'DELETE',
					headers: {
						authorization: `Bearer ${apiToken}`,
					},
				},
			);
			assert.equal(missingDeleteResponse.status, 404);
			assert.deepEqual(await missingDeleteResponse.json(), {
				error: 'NOT_FOUND',
				success: false,
			});

			const localSessionResponse = await fetch(`${baseUrl}/newsletters/session`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `http://${localOriginHostname}:4173`,
				},
				body: JSON.stringify({
					action: 'subscribe',
					list_name: 'weekly',
				}),
			});
			assert.equal(localSessionResponse.status, 200);
			const { payload: localSessionPayload } = await parseJsonResponse(localSessionResponse);
			assert.deepEqual(localSessionPayload.success, true);
			assert.equal(localSessionPayload.value.siteKey, testTurnstileSiteKey);

			const localSubscribeResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `http://${localOriginHostname}:4173`,
					'x-submit-token': localSessionPayload.value.submitToken,
				},
				body: JSON.stringify({
					email: 'dev@example.com',
					hostname: localOriginHostname,
					list_name: 'weekly',
					turnstile_token: turnstileTestToken,
				}),
			});
			const { payload: localSubscribePayload, status: localSubscribeStatus } = await parseJsonResponse(localSubscribeResponse);
			assert.equal(localSubscribeStatus, 200, JSON.stringify(localSubscribePayload));
			assert.deepEqual(localSubscribePayload, {
				success: true,
				value: 'SINK_ACCEPTED',
			});
			await assertSubscriptionCount(stateDir, 0);

			const deleteTemplateResponse = await fetch(
				`${baseUrl}/api/templates/${ownedTemplateName}?hostname=${encodeURIComponent(testHostname)}`,
				{
					method: 'DELETE',
					headers: {
						authorization: `Bearer ${apiToken}`,
					},
				},
			);
			assert.equal(deleteTemplateResponse.status, 200);
			assert.deepEqual(await deleteTemplateResponse.json(), {
				success: true,
				value: 'DELETED',
			});

			const missingTemplateResponse = await fetch(
				`${baseUrl}/api/templates/${ownedTemplateName}?hostname=${encodeURIComponent(testHostname)}`,
				{
					method: 'GET',
					headers: {
						authorization: `Bearer ${apiToken}`,
					},
				},
			);
			assert.equal(missingTemplateResponse.status, 404);
			assert.deepEqual(await missingTemplateResponse.json(), {
				error: 'NOT_FOUND',
				success: false,
			});

			const reusedSessionResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
					'x-submit-token': sessionPayload.value.submitToken,
				},
				body: JSON.stringify({
					email: 'person2@softwarepatterns.com',
					hostname: testHostname,
					list_name: 'weekly',
					turnstile_token: turnstileTestToken,
				}),
			});
			const { payload: reusedSessionPayload } = await parseJsonResponse(reusedSessionResponse);
			assert.equal(reusedSessionResponse.status, 200);
			assert.deepEqual(reusedSessionPayload, {
				success: true,
				value: 'SUBSCRIBED',
			});
			await assertSubscriptionCount(stateDir, 1);

			const unknownHostnameResponse = await fetch(`${baseUrl}/newsletters/session`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: 'https://unknown.example',
				},
				body: JSON.stringify({
					action: 'subscribe',
					list_name: 'weekly',
				}),
			});
			const { payload: unknownHostnamePayload } = await parseJsonResponse(unknownHostnameResponse);
			assert.equal(unknownHostnameResponse.status, 403);
			assert.deepEqual(unknownHostnamePayload, {
				success: false,
				error: 'UNKNOWN_HOSTNAME',
			});

			const verifyResponse = await fetch(`${baseUrl}/verify?hostname=example.com`);
			const { payload: verifyPayload } = await parseJsonResponse(verifyResponse);
			assert.equal(verifyResponse.status, 501);
			assert.deepEqual(verifyPayload, {
				success: false,
				error: 'EMAIL_CONFIRMATION_DISABLED',
			});
		} finally {
			devServer.kill('SIGTERM');
			await new Promise((resolveExit) => devServer.once('exit', resolveExit));
		}
	} finally {
		await jwksServer.close();
		await rm(stateDir, { force: true, recursive: true });
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
