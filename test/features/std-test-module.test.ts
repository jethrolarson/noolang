// std/test — the test framework's types and assertions, shipped with the
// interpreter but built as plain userland noolang (no interpreter privileges).
// See docs-wip/TESTING_FRAMEWORK_PLAN.md.
import { test, expect } from 'bun:test';
import { runCode, expectSuccess } from '../utils';

const importTest = `{@test_case, @group, @expect_eq, @expect, @expect_ok, @expect_err, @expect_all, @fail} = import "std/test";`;

// Assertions produce Expectation values; assert through match so the tests
// exercise the real consumer surface (imported constructors, pattern matching)
const verdict = (expectationExpr: string) => `
${importTest}
match (${expectationExpr}) (
  Pass => "pass";
  Fail info => concat "fail:" (@message info)
)`;

test('expect_eq on equal values is Pass', () => {
	expectSuccess(verdict('expect_eq 4 (2 + 2)'), 'pass');
});

test('expect_eq on unequal values is Fail carrying expected and actual', () => {
	expectSuccess(
		`
${importTest}
match (expect_eq 4 5) (
  Pass => "pass";
  Fail {@expected Some e, @actual Some a} => concat e (concat " vs " a);
  Fail _ => "missing diff"
)`,
		'4 vs 5'
	);
});

test('expect with a true condition is Pass, false is labeled Fail', () => {
	expectSuccess(verdict('expect "is positive" (1 < 2)'), 'pass');
	expectSuccess(verdict('expect "is positive" (2 < 1)'), 'fail:is positive');
});

test('expect_ok / expect_err inspect Results', () => {
	expectSuccess(verdict('expect_ok (Ok 1)'), 'pass');
	expectSuccess(verdict('expect_err (Err "boom")'), 'pass');
});

test('expect_ok on Err is Fail showing the error', () => {
	expectSuccess(
		`
${importTest}
match (expect_ok (Err "boom")) (
  Pass => "pass";
  Fail info => @message info
)`,
		expect.stringContaining('boom')
	);
});

test('expect_all passes when all pass, fails on the first Fail', () => {
	expectSuccess(verdict('expect_all [expect_eq 1 1, expect_eq 2 2]'), 'pass');
	expectSuccess(
		verdict('expect_all [expect_eq 1 1, fail "second", fail "third"]'),
		'fail:second'
	);
});

test('test_case and group build an inspectable Test tree', () => {
	expectSuccess(
		`
${importTest}
suite = group "math" [
  test_case "adds" (fn _ => expect_eq 4 (2 + 2)),
  test_case "subtracts" (fn _ => expect_eq 0 (2 - 2))
];
match suite (
  Group name tests => concat name (concat ":" (show (length tests)));
  Case _ _ => "unexpected"
)`,
		'math:2'
	);
});

test('a test thunk runs when called, effectful thunks included', () => {
	expectSuccess(
		`
${importTest}
t = test_case "logs" (fn _ => (print "side effect"; expect_eq 1 1));
match t (
  Case _ thunk => match (thunk {}) ( Pass => "pass"; Fail _ => "fail" );
  Group _ _ => "unexpected"
)`,
		'pass'
	);
});

test('the module export types are visible to the importer', () => {
	const { finalType } = runCode(
		`{@expect_eq} = import "std/test"; expect_eq`
	);
	expect(finalType).toContain('Expectation');
});
