import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(__dirname, '../..');
const d1Name = 'newsletters';

export const publicTemplates = [
	{
		name: 'daisyui',
		path: join(workspaceDir, 'examples/templates/tailwind-daisyui-dialog.html'),
	},
	{
		name: 'starter',
		path: join(workspaceDir, 'examples/templates/starter-dialog.html'),
	},
];

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

const runCommand = (args) =>
	new Promise((resolveRun, reject) => {
		const child = spawn(args[0], args.slice(1), {
			cwd: workspaceDir,
			stdio: ['ignore', 'pipe', 'pipe'],
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
	});

const requirePublicTemplate = (name) => {
	const template = publicTemplates.find((entry) => entry.name === name);
	if (!template) {
		throw new Error(`Unknown public template: ${name}`);
	}

	return template;
};

const buildPublicTemplateSql = async (template) => {
	const markup = await readFile(template.path, 'utf8');
	const now = Date.now();

	return `INSERT INTO newsletter_template (name, hostname, markup, created_at, updated_at) VALUES (${sqlString(template.name)}, NULL, ${sqlString(markup)}, ${now}, ${now}) ON CONFLICT(name) DO UPDATE SET hostname = excluded.hostname, markup = excluded.markup, updated_at = excluded.updated_at;`;
};

const executeRemoteSql = async (sql) => {
	return runCommand(['npx', 'wrangler', 'd1', 'execute', d1Name, '--remote', '--yes', '--command', sql]);
};

export const syncPublicTemplateByName = async (name) => {
	const template = requirePublicTemplate(name);
	const sql = await buildPublicTemplateSql(template);
	await executeRemoteSql(sql);
	return template;
};

export const syncAllPublicTemplates = async () => {
	for (const template of publicTemplates) {
		await syncPublicTemplateByName(template.name);
	}

	return publicTemplates;
};
