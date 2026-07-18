// exit terminates the process with the given code — needed by any noolang
// program that reports status to a shell (the test runner most immediately).
import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runCode } from '../utils';

const repoRoot = resolve(__dirname, '..', '..');
const cli = join(repoRoot, 'src', 'cli.ts');

test('exit has type Float -> {} with an effect', () => {
	const { finalType } = runCode('exit');
	expect(finalType).toContain('Float');
	expect(finalType).toContain('!ffi');
});

test('exit terminates the process with the given code', () => {
	let status = 0;
	try {
		execFileSync('bun', [cli, '-e', 'exit 3'], {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: 'pipe',
		});
	} catch (error: any) {
		status = error.status;
	}
	expect(status).toBe(3);
});

test('exit 0 exits cleanly even mid-program', () => {
	const out = execFileSync('bun', [cli, '-e', 'x = print "before"; exit 0'], {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: 'pipe',
	});
	expect(out).toContain('before');
});
