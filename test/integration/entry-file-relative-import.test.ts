// Relative imports resolve against the importing file's directory, per
// docs/language-reference.md §Import System — not against the process CWD.
// Runs the real CLI from a different CWD to prove it.
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const cli = join(repoRoot, 'src', 'cli.ts');

const dir = mkdtempSync(join(tmpdir(), 'noo-entry-import-'));
writeFileSync(join(dir, 'dep.noo'), '{@answer 42}');
writeFileSync(
	join(dir, 'main.noo'),
	'{@answer} = import "./dep";\nanswer'
);

function runCli(cliArgs: string[]): string {
	return execFileSync('bun', [cli, ...cliArgs], {
		cwd: repoRoot, // deliberately not `dir`
		encoding: 'utf8',
		env: { ...process.env, NO_COLOR: '1' },
	});
}

test('running a file resolves its relative imports from the file dir, not CWD', () => {
	// --verbose: plain execution no longer auto-prints the final value.
	expect(runCli(['--verbose', join(dir, 'main.noo')])).toContain('42');
});

test('--types-file resolves relative imports from the file dir, not CWD', () => {
	expect(runCli(['--types-file', join(dir, 'main.noo')])).toContain('Float');
});

test('cleanup', () => {
	rmSync(dir, { recursive: true, force: true });
});
