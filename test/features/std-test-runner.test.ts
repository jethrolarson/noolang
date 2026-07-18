// std/test runner: run_tree executes the Test tree into a TestResult,
// format_result renders the report (pure), result_counts aggregates (pure),
// run_all prints and returns counts. Exit codes are the caller's job.
import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { expectSuccess } from '../utils';

const repoRoot = resolve(__dirname, '..', '..');
const cli = join(repoRoot, 'src', 'cli.ts');

const importAll = `{@test_case, @group, @expect_eq, @fail, @run_tree, @format_result, @result_counts, @run_all} = import "std/test";`;

const sampleSuite = `
suite = group "math" [
  test_case "adds" (fn _ => expect_eq 4 (2 + 2)),
  test_case "breaks" (fn _ => expect_eq 7 8),
  group "edge" [
    test_case "zero" (fn _ => expect_eq 0 0)
  ]
];`;

test('run_tree executes thunks and mirrors the tree shape', () => {
	expectSuccess(
		`
${importAll}
${sampleSuite}
match (run_tree suite) (
  GroupResult name results => concat name (concat ":" (show (length results)));
  CaseResult _ _ => "unexpected"
)`,
		'math:3'
	);
});

test('result_counts aggregates passes and failures across nesting', () => {
	expectSuccess(
		`
${importAll}
${sampleSuite}
counts = result_counts (run_tree suite);
concat (show (@passed counts)) (concat "/" (show (@failed counts)))`,
		'2/1'
	);
});

test('format_result renders the tree with pass/fail marks and diff lines', () => {
	expectSuccess(
		`
${importAll}
${sampleSuite}
format_result (run_tree suite)`,
		[
			'math',
			'  ✓ adds',
			'  ✗ breaks',
			'      expected: 7',
			'      actual:   8',
			'  edge',
			'    ✓ zero',
		].join('\n')
	);
});

test('format_result renders a message-only failure without diff lines', () => {
	expectSuccess(
		`
${importAll}
t = test_case "boom" (fn _ => fail "it broke");
format_result (run_tree t)`,
		['✗ boom', '    it broke'].join('\n')
	);
});

test('run_all prints report plus summary and returns counts', () => {
	const out = execFileSync(
		'bun',
		[
			cli,
			'-e',
			`{@test_case, @group, @expect_eq, @run_all} = import "std/test";
			 run_all [{@path "demo.test.noo", @suite group "math" [
			   test_case "adds" (fn _ => expect_eq 4 (2 + 2)),
			   test_case "breaks" (fn _ => expect_eq 7 8)
			 ]}]`,
		],
		{ cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
	);
	expect(out).toContain('demo.test.noo');
	expect(out).toContain('✓ adds');
	expect(out).toContain('✗ breaks');
	expect(out).toContain('1 passed, 1 failed');
});
