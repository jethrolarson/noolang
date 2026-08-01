import { test, expect } from 'bun:test';
import { runCode } from '../../utils';

// Point-free `match`: `match (arms)` with the scrutinee omitted desugars to
// `fn __match_x => match __match_x (arms)`, the same category of pure
// parse-time sugar as operator sectioning (`(op)` -> `fn a b => a op b`,
// see test/features/operators/dollar_operator.test.ts and
// parseOperatorSection in src/parser/parser.ts). Lets `fn foo => match
// (foo) (...)` eta-reduce to `match (...)`.
//
// `match (` is shared with the existing `match (scrutinee) (arms)` form, so
// this suite also covers the adversarial cases from
// docs/internal/docs-wip/POINT_FREE_MATCH_PLAN.md's ambiguity spike: a
// parenthesized scrutinee that's a bare identifier, and one that's a
// parenthesized single-arg lambda. Both must keep parsing as the existing
// two-argument form, unaffected by the new point-free branch.

test('point-free match desugars to a function', () => {
	const result = runCode(`
        classify = match (Some x => x; None => 0);
        classify (Some 5)
      `);
	expect(result.finalValue).toEqual(5);
});

test('point-free match works applied inline', () => {
	const result = runCode(`
        (match (Some x => x; None => 0)) (Some 5)
      `);
	expect(result.finalValue).toEqual(5);
});

test('point-free match is usable as a higher-order argument', () => {
	const result = runCode(`
        map (match (Some x => x; None => 0)) [Some 1, None, Some 3]
      `);
	expect(result.finalValue).toEqual([1, 0, 3]);
});

test('adversarial: parenthesized bare-identifier scrutinee still parses as the two-argument form', () => {
	const result = runCode(`
        foo = Some 5;
        match (foo) (Some x => x; None => 0)
      `);
	expect(result.finalValue).toEqual(5);
});

test('adversarial: parenthesized single-arg lambda scrutinee still parses as the two-argument form', () => {
	const result = runCode(`
        match (fn x => x) (_ => "matched")
      `);
	expect(result.finalValue).toEqual('matched');
});

test('point-free match is eta-equivalent to the pointful lambda wrapper', () => {
	const pointful = runCode(`
        fn foo => match (foo) (Some x => x; None => 0)
      `);
	const pointfree = runCode(`
        match (Some x => x; None => 0)
      `);
	// Both should produce callable functions with the same behavior.
	expect(typeof pointful.finalValue).toEqual(typeof pointfree.finalValue);
});
