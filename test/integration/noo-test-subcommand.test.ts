// `noo test`: discovers *.test.noo, runs each suite in its own process
// (per-file isolation — one crashing file must not kill the run), prints the
// reports, exits nonzero iff any suite failed.
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '..', '..');
const cli = join(repoRoot, 'src', 'cli.ts');

function makeProject(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'noo-test-cmd-'));
	for (const [rel, content] of Object.entries(files)) {
		mkdirSync(join(dir, rel, '..'), { recursive: true });
		writeFileSync(join(dir, rel), content);
	}
	return dir;
}

function runNooTest(cwd: string): { status: number; out: string } {
	try {
		const out = execFileSync('bun', [cli, 'test'], {
			cwd,
			encoding: 'utf8',
			stdio: 'pipe',
			env: { ...process.env, NO_COLOR: '1' },
		});
		return { status: 0, out };
	} catch (error: any) {
		return {
			status: error.status ?? -1,
			out: String(error.stdout ?? '') + String(error.stderr ?? ''),
		};
	}
}

const passing = `
{@test_case, @group, @expect_eq} = import "std/test";
group "math" [
  test_case "adds" (fn _ => expect_eq 4 (2 + 2))
]`;

const failing = `
{@test_case, @group, @expect_eq} = import "std/test";
group "broken" [
  test_case "wrong" (fn _ => expect_eq 7 8)
]`;

const crashing = `
{@test_case, @group, @expect_eq} = import "std/test";
boom = unwrap None;
group "crash" [ test_case "unreachable" (fn _ => expect_eq 1 1) ]`;

test('all suites passing: reports and exits 0', () => {
	const dir = makeProject({ 'math.test.noo': passing });
	const { status, out } = runNooTest(dir);
	expect(out).toContain('✓ adds');
	expect(status).toBe(0);
	rmSync(dir, { recursive: true, force: true });
});

test('a failing suite: diff in output, exit nonzero', () => {
	const dir = makeProject({
		'math.test.noo': passing,
		'sub/broken.test.noo': failing,
	});
	const { status, out } = runNooTest(dir);
	expect(out).toContain('✓ adds');
	expect(out).toContain('✗ wrong');
	expect(out).toContain('expected: 7');
	expect(status).not.toBe(0);
	rmSync(dir, { recursive: true, force: true });
});

test('a crashing suite is isolated: other suites still run', () => {
	const dir = makeProject({
		'math.test.noo': passing,
		'crash.test.noo': crashing,
	});
	const { status, out } = runNooTest(dir);
	expect(out).toContain('✓ adds');
	expect(out).toContain('crash.test.noo');
	expect(status).not.toBe(0);
	rmSync(dir, { recursive: true, force: true });
});

test('no test files found: says so and exits 0', () => {
	const dir = makeProject({ 'not-a-test.noo': '42' });
	const { status, out } = runNooTest(dir);
	expect(out.toLowerCase()).toContain('no test files');
	expect(status).toBe(0);
	rmSync(dir, { recursive: true, force: true });
});
