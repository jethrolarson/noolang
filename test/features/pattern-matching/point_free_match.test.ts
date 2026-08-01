import { test, expect } from 'bun:test';
import { runCode } from '../../utils';

// Point-free `match`: `match_ (arms)` — scrutinee omitted, argument moved
// to last position, per the trailing-underscore "flipped form" convention
// (docs/internal/adrs/0001-trailing-underscore-flip.md) — desugars to
// `fn __match_x => match __match_x (arms)`. Lets `fn foo => match (foo)
// (...)` eta-reduce to `match_ (...)`.
//
// `match_` is lexed as its own distinct KEYWORD token (src/lexer/lexer.ts),
// separate from `match` — there is no shared prefix with the two-argument
// `match <scrutinee> (arms)` form, so unlike an earlier version of this
// feature (which spelled point-free match as `match (arms)` and
// disambiguated from `match (scrutinee) (arms)` via parser backtracking),
// there is no ambiguity to test for here: the lexer has already told the
// two forms apart before the parser sees either.

test('point-free match_ desugars to a function', () => {
	const result = runCode(`
        classify = match_ (Some x => x; None => 0);
        classify (Some 5)
      `);
	expect(result.finalValue).toEqual(5);
});

test('point-free match_ works applied inline', () => {
	const result = runCode(`
        (match_ (Some x => x; None => 0)) (Some 5)
      `);
	expect(result.finalValue).toEqual(5);
});

test('point-free match_ is usable as a higher-order argument', () => {
	const result = runCode(`
        map (match_ (Some x => x; None => 0)) [Some 1, None, Some 3]
      `);
	expect(result.finalValue).toEqual([1, 0, 3]);
});

test('match_ with a wildcard catch-all', () => {
	const result = runCode(`
        describe = match_ (Some x => "got " + show x; _ => "nothing");
        describe None
      `);
	expect(result.finalValue).toEqual('nothing');
});

test('nested match_ inside an ordinary match case body', () => {
	const result = runCode(`
        unwrapTwice = fn opt => match opt (
            Some inner => (match_ (Some x => x; None => -1)) inner;
            None => -2
        );
        unwrapTwice (Some (Some 7))
      `);
	expect(result.finalValue).toEqual(7);
});

test('point-free match_ is eta-equivalent to the pointful lambda wrapper', () => {
	// Apply both forms to the same inputs and compare actual results (not
	// just typeof) and inferred types, so this would fail if the desugaring
	// diverged in behavior, not just in shape.
	const pointful = runCode(`
        f = fn foo => match (foo) (Some x => x; None => 0);
        {f (Some 5), f None}
      `);
	const pointfree = runCode(`
        g = match_ (Some x => x; None => 0);
        {g (Some 5), g None}
      `);
	expect(pointfree.finalValue).toEqual(pointful.finalValue);
	expect(pointfree.finalValue).toEqual([5, 0]);
	expect(pointfree.finalType).toEqual(pointful.finalType);
});
