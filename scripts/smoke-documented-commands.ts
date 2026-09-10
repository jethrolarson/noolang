#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

interface DocumentedCommand {
	label: string;
	args: string[];
	expectedOutput?: string;
}

const commands: DocumentedCommand[] = [
	{
		label: 'evaluate an expression',
		args: ['start', '--eval', '1 + 2 * 3'],
		expectedOutput: '7',
	},
	{
		label: 'infer an expression type',
		args: ['start', '--types', 'fn x => x'],
		expectedOutput: 'a -> a',
	},
	{
		label: 'run a Noolang file',
		args: ['start', 'examples/basic.noo'],
	},
];

const root = resolve(__dirname, '..');
let failed = false;

for (const command of commands) {
	const rendered = `bun ${command.args.join(' ')}`;
	const result = spawnSync('bun', command.args, {
		cwd: root,
		encoding: 'utf8',
		env: { ...process.env, NO_COLOR: '1' },
	});
	const output = `${result.stdout}${result.stderr}`;
	const passed =
		result.status === 0 &&
		(!command.expectedOutput || output.includes(command.expectedOutput));

	if (passed) {
		process.stdout.write(`PASS: ${command.label} (${rendered})\n`);
	} else {
		failed = true;
		process.stderr.write(`FAIL: ${command.label} (${rendered})\n`);
		if (output.trim()) process.stderr.write(`${output.trim()}\n`);
	}
}

if (failed) process.exit(1);
