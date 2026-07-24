import { test, expect } from 'bun:test';
import { runCode } from '../../utils';

// $ is low-precedence, right-associative function application — `f $ x` is
// `f x`, meant to replace an outer pair of parens. Fully implemented in the
// typer (handleDollar) and evaluator, and reachable via operator sectioning
// ((`$`)), but had no parser rule turning plain infix `f $ x` into that
// BinaryExpression at all — this suite is a regression test for that gap.

test('applies a function to an argument', () => {
	const result = runCode(`
        add_one = fn x => x + 1;
        add_one $ 5
      `);
	expect(result.finalValue).toEqual(6);
});

test('avoids nested parens for chained application', () => {
	const result = runCode(`
        map (fn x => x * 2) $ filter (fn x => x > 5) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      `);
	const withParens = runCode(`
        map (fn x => x * 2) (filter (fn x => x > 5) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      `);
	expect(result.finalValue).toEqual(withParens.finalValue);
});

test('is right-associative: f $ g $ x is f (g x)', () => {
	const result = runCode(`
        add_one = fn x => x + 1;
        double = fn x => x * 2;
        add_one $ double $ 5
      `);
	expect(result.finalValue).toEqual(11);
});

test('binds looser than thrush/pipe operators', () => {
	// `|` should bind tighter than `$`, so this is add_one $ (5 | double)
	const result = runCode(`
        add_one = fn x => x + 1;
        double = fn x => x * 2;
        add_one $ 5 | double
      `);
	expect(result.finalValue).toEqual(11);
});
