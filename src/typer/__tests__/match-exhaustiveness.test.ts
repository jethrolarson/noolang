import { test, expect } from 'bun:test';
import { parseAndType, runCode } from '../../../test/utils';

// A match on a concrete variant must cover every constructor or have a
// catch-all; otherwise it is a type error.

test('non-exhaustive Option match is rejected', () => {
	expect(() => parseAndType('match (Some 1) (Some x => x)')).toThrow(
		/Non-exhaustive match on Option: missing case None/
	);
});

test('non-exhaustive Result match is rejected', () => {
	expect(() => parseAndType('fn r => match r (Ok x => x)')).toThrow(
		/missing case Err/
	);
});

test('non-exhaustive custom variant reports every missing constructor', () => {
	expect(() =>
		parseAndType('variant C = R | G | B; match R (R => 1)')
	).toThrow(/missing cases G, B/);
});

test('non-exhaustive Bool match is rejected', () => {
	expect(() => parseAndType('fn b => match b (True => 1)')).toThrow(
		/missing case False/
	);
});

test('exhaustive match is accepted', () => {
	expect(runCode('match (Some 1) (Some x => x; None => 0)').finalValue).toBe(1);
});

test('a wildcard makes a match exhaustive', () => {
	expect(runCode('match (Some 1) (Some x => x; _ => 0)').finalValue).toBe(1);
});

test('a variable catch-all makes a match exhaustive', () => {
	expect(runCode('variant C = R | G | B; match G (R => 1; other => 2)').finalValue).toBe(2);
});

test('a match on a non-variant / still-polymorphic scrutinee is not flagged', () => {
	// `fn x => match x (_ => 1)` — scrutinee never resolves to a variant.
	expect(() => parseAndType('fn x => match x (_ => 1)')).not.toThrow();
});
