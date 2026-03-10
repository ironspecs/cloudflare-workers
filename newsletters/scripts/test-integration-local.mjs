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
			const sessionPayload = await sessionResponse.json();
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
					email: 'person@example.com',
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
			assert.equal(reusedSessionResponse.status, 403);
			assert.deepEqual(await reusedSessionResponse.json(), {
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
			assert.equal(unknownHostnameResponse.status, 403);
			assert.deepEqual(await unknownHostnameResponse.json(), {
				success: false,
				error: 'UNKNOWN_HOSTNAME',
			});

			const verifyResponse = await fetch(`${baseUrl}/verify?hostname=example.com`);
			assert.equal(verifyResponse.status, 501);
			assert.deepEqual(await verifyResponse.json(), {
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
