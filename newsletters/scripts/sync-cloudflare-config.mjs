import { randomBytes, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(__dirname, '..');

const AES_ALGORITHM = 'AES-GCM';
const ENVELOPE_VERSION = 'v1';
const IV_LENGTH = 12;
const workerName = 'newsletters';
const d1Name = 'newsletters';

const encodeUtf8 = (value) => new TextEncoder().encode(value);
const toBase64 = (value) => Buffer.from(value).toString('base64');
const fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

const createEnvelopeAad = (hostname, fieldName) => encodeUtf8(`hostname_config_secrets|${hostname}|${fieldName}|${ENVELOPE_VERSION}`);

const importAesKey = async (keyBase64) => {
	return webcrypto.subtle.importKey('raw', fromBase64(keyBase64), { name: AES_ALGORITHM }, false, ['encrypt']);
};

const encryptString = async (keyBase64, plaintext, aad) => {
	const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await importAesKey(keyBase64);
	const ciphertext = await webcrypto.subtle.encrypt(
		{
			additionalData: aad,
			iv,
			name: AES_ALGORITHM,
		},
		key,
		encodeUtf8(plaintext),
	);

	return `${ENVELOPE_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
};

const createRandomBase64Key = () => toBase64(randomBytes(32));

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

const runCommand = (args, options = {}) =>
	new Promise((resolveRun, reject) => {
		const child = spawn(args[0], args.slice(1), {
			cwd: workspaceDir,
			stdio: ['pipe', 'pipe', 'pipe'],
			...options,
		});
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
				resolveRun({ stderr, stdout });
				return;
			}

			reject(new Error(`Command failed (${code}): ${args.join(' ')}\n${stderr || stdout}`));
		});

		if (options.stdin) {
			child.stdin.write(options.stdin);
		}
		child.stdin.end();
	});

const loadEncryptedConfig = async () => {
	const { stdout } = await runCommand(['sops', '--decrypt', 'config-enc.yaml']);
	const parsed = YAML.parse(stdout);

	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid newsletters config');
	}

	const keks = parsed.keks;
	const turnstileHostnames = parsed.turnstile?.hostnames;
	if (!keks || typeof keks.active_id !== 'string' || !keks.keys || typeof keks.keys !== 'object') {
		throw new Error('Missing keks config');
	}

	if (!turnstileHostnames || typeof turnstileHostnames !== 'object') {
		throw new Error('Missing turnstile.hostnames config');
	}

	return {
		keks: {
			active_id: keks.active_id,
			keys: keks.keys,
		},
		turnstileHostnames,
	};
};

const buildHostnameSecretsSql = async (config) => {
	const statements = [];
	const activeKek = config.keks.keys[config.keks.active_id];
	if (typeof activeKek !== 'string' || activeKek.length === 0) {
		throw new Error(`Missing active KEK ${config.keks.active_id}`);
	}

	for (const [hostname, values] of Object.entries(config.turnstileHostnames)) {
		if (!values || typeof values !== 'object') {
			throw new Error(`Invalid turnstile config for ${hostname}`);
		}

		const siteKey = values.site_key;
		const secretKey = values.secret_key;
		if (typeof siteKey !== 'string' || typeof secretKey !== 'string') {
			throw new Error(`Missing turnstile keys for ${hostname}`);
		}

		const dek = createRandomBase64Key();
		const dekWrapped = await encryptString(activeKek, dek, createEnvelopeAad(hostname, 'dek_wrapped'));
		const turnstileSecretCiphertext = await encryptString(dek, secretKey, createEnvelopeAad(hostname, 'turnstile_secret_key'));

		statements.push(
			`INSERT INTO hostname_config (hostname, turnstile_site_key) VALUES (${sqlString(hostname)}, ${sqlString(siteKey)}) ON CONFLICT(hostname) DO UPDATE SET turnstile_site_key = excluded.turnstile_site_key;`,
		);
		statements.push(
			`INSERT INTO hostname_config_secrets (hostname, dek_kek_id, dek_wrapped, turnstile_secret_key_ciphertext) VALUES (${sqlString(hostname)}, ${sqlString(config.keks.active_id)}, ${sqlString(dekWrapped)}, ${sqlString(turnstileSecretCiphertext)}) ON CONFLICT(hostname) DO UPDATE SET dek_kek_id = excluded.dek_kek_id, dek_wrapped = excluded.dek_wrapped, turnstile_secret_key_ciphertext = excluded.turnstile_secret_key_ciphertext;`,
		);
	}

	return statements.join('\n');
};

const main = async () => {
	const tempDir = await mkdtemp(join(tmpdir(), 'newsletters-config-sync-'));
	const sqlPath = join(tempDir, 'sync.sql');

	try {
		const config = await loadEncryptedConfig();
		const sql = await buildHostnameSecretsSql(config);

		await runCommand(['npx', 'wrangler', 'secret', 'put', 'HOSTNAME_CONFIG_KEKS_JSON', '--name', workerName], {
			stdin: JSON.stringify(config.keks),
		});

		await writeFile(sqlPath, sql, 'utf8');
		await runCommand(['npx', 'wrangler', 'd1', 'execute', d1Name, '--remote', '--yes', '--file', sqlPath]);

		const { stdout } = await runCommand([
			'npx',
			'wrangler',
			'd1',
			'execute',
			d1Name,
			'--remote',
			'--json',
			'--command',
			'SELECT hostname, turnstile_site_key FROM hostname_config ORDER BY hostname;',
		]);

		process.stdout.write(stdout);
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
