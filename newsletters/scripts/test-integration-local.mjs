import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const testKeksJson = JSON.stringify({
	active_id: testDekKekId,
	keys: {
		[testDekKekId]: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
	},
});
const testDekWrapped = 'v1.U+JvHS9wSuC747CG.MhLYqrtoU3looBKOyyjGeAf2/7GlXB6uuQ5o66oD5k44Zux2O3e4Z2tOfXDbivXOFPSi6ds/S082vxSK';
const testTurnstileSecretCiphertext = 'v1.DkN/GUS12go12qyj.AZJae9HJFXg5IS57zL6bngrN88JWH2uytYp+sSNwMt/BYQfknlbcY/JHCUC6YBnRgm+Z';

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
				`INSERT INTO hostname_config (hostname, turnstile_site_key) VALUES ('${testHostname}', '${testTurnstileSiteKey}');`,
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
				`INSERT INTO hostname_config (hostname, turnstile_site_key) VALUES ('localhost', NULL), ('${localOriginHostname}', NULL);`,
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
			assert.match(await homepage.text(), /<form/i);

			const newslettersScriptResponse = await fetch(`${baseUrl}/newsletters.js`);
			assert.equal(newslettersScriptResponse.status, 200);
			assert.match(newslettersScriptResponse.headers.get('content-type') ?? '', /application\/javascript/);
			assert.match(await newslettersScriptResponse.text(), /window\.Newsletters/);

			const preflightResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'OPTIONS',
				headers: {
					origin: `https://${testHostname}`,
				},
			});
			assert.equal(preflightResponse.status, 204);
			assert.equal(preflightResponse.headers.get('access-control-allow-origin'), `https://${testHostname}`);
			assert.match(preflightResponse.headers.get('access-control-allow-headers') ?? '', /X-CSRF-Token/);

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
			assert.equal(typeof sessionPayload.value.csrfToken, 'string');
			assert.equal(typeof sessionPayload.value.sessionId, 'string');
			assert.equal(sessionPayload.value.siteKey, testTurnstileSiteKey);

			const subscribeResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
					'x-csrf-token': sessionPayload.value.csrfToken,
					'x-session-id': sessionPayload.value.sessionId,
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
					'x-csrf-token': localSessionPayload.value.csrfToken,
					'x-session-id': localSessionPayload.value.sessionId,
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
			await assertSubscriptionCount(stateDir, 1);

			const reusedSessionResponse = await fetch(`${baseUrl}/subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: `https://${testHostname}`,
					'x-csrf-token': sessionPayload.value.csrfToken,
					'x-session-id': sessionPayload.value.sessionId,
				},
				body: JSON.stringify({
					email: 'person2@example.com',
					hostname: testHostname,
					list_name: 'weekly',
					turnstile_token: turnstileTestToken,
				}),
			});
			const { payload: reusedSessionPayload } = await parseJsonResponse(reusedSessionResponse);
			assert.equal(reusedSessionResponse.status, 403);
			assert.deepEqual(reusedSessionPayload, {
				success: false,
				error: 'INVALID_SESSION',
			});

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
		await rm(stateDir, { force: true, recursive: true });
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
