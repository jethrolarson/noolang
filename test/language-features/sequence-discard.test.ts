// Sequence-position discard rules:
// - A non-final bare expression in a *nested* (parenthesized) sequence must be
//   unit-typed; its effects propagate like a binding's. Dropping unit discards
//   nothing; silently dropping data is the bug this rule catches.
// - `_ = expr` is the explicit escape valve: binds nothing, accepts any type.
// - The unparenthesized top level of a program stays permissive — literate
//   docs and scripts display values there by convention.
import { test, expect, describe } from 'bun:test';
import { expectSuccess, expectError, runCode } from '../utils';

describe('bare expressions in nested sequences', () => {
	test('unit-typed bare expression is allowed mid-sequence', () => {
		expectSuccess('f = fn x => (println "hi"; x + 1); f 1', 2);
	});

	test('bare log call is allowed mid-sequence', () => {
		expectSuccess('f = fn x => (log "hi"; x + 1); f 1', 2);
	});

	test('effects of a bare item propagate to the enclosing function', () => {
		const result = runCode('fn x => (println "hi"; x + 1)');
		expect(result.finalType).toContain('!write');
	});

	test('non-unit bare expression mid-sequence is a type error', () => {
		expectError('f = fn x => (1 + 1; x); f 2', /unit|discard/);
	});

	test('non-unit bare expression in a parenthesized sequence is a type error', () => {
		expectError('(1 + 1; 2)', /unit|discard/);
	});

	test('Result-returning call may not be bare (silent failure drop)', () => {
		expectError('f = fn p => (writeFile p "x"; 1); f "/tmp/x"', /unit|discard/);
	});

	test('the final item of a sequence is unrestricted', () => {
		expectSuccess('(println "a"; 42)', 42);
	});

	test('a nested unit-typed paren sequence is fine as a non-final item', () => {
		expectSuccess('f = fn x => ((println "a"; {}); x); f 7', 7);
	});

	test('non-unit deep inside a nested paren sequence still errors', () => {
		expectError('f = fn x => ((println "a"; [1]); x); f 7', /unit|discard/);
	});

	test('named bindings of non-unit values are still fine mid-sequence', () => {
		expectSuccess('f = fn x => (a = [1, 2]; length a + x); f 1', 3);
	});

	test('top-level unparenthesized sequences stay permissive', () => {
		expectSuccess('1 + 1; "x"', 'x');
	});
});

describe('_ = expr wildcard binding', () => {
	test('accepts a non-unit value silently', () => {
		expectSuccess('f = fn x => (_ = [1, 2, 3]; x); f 5', 5);
	});

	test('works at the top level', () => {
		expectSuccess('_ = 42; "done"', 'done');
	});

	test('evaluates its right-hand side', () => {
		expectSuccess('mut n = 0; f = fn u => (_ = mut! n = 9; n); f {}', 9);
	});

	test('propagates effects', () => {
		const result = runCode('fn x => (_ = println "hi"; x)');
		expect(result.finalType).toContain('!write');
	});

	test('does not bind a referenceable name', () => {
		expectError('_ = 5; _ + 1');
	});

	test('may repeat within one sequence', () => {
		expectSuccess('f = fn x => (_ = [1]; _ = "s"; x); f 3', 3);
	});

	test('is accepted in where clauses', () => {
		expectSuccess('y where (_ = println "side"; y = 2)', 2);
	});
});
