import { test, describe, expect } from 'bun:test';
import { expectSuccess, expectError, runCode } from '../../utils';

// Regression: == and != had no trait-resolution fallback, so every
// variant/list comparison silently returned False.
describe('==/!= trait dispatch', () => {
	test('== on Option values uses Eq', () => {
		expectSuccess(`(Some 3) == (Some 3)`, true);
	});

	test('== distinguishes unequal Options', () => {
		expectSuccess(`(Some 3) == (Some 4)`, false);
	});

	test('== on Some vs None', () => {
		expectSuccess(`(Some 3) == None`, false);
	});

	test('!= negates the Eq result on variants', () => {
		expectSuccess(`(Some 3) != (Some 4)`, true);
	});

	test('== on lists is structural', () => {
		expectSuccess(`[2, 3] == [2, 3]`, true);
	});

	test('== on unequal lists', () => {
		expectSuccess(`[2, 3] == [2, 4]`, false);
	});

	test('== on nested variants in lists', () => {
		expectSuccess(`[Some 1, None] == [Some 1, None]`, true);
	});

	test('== on Bool variants', () => {
		expectSuccess(`True == True`, true);
	});

	test('== on primitives still works', () => {
		expectSuccess(`1 == 1`, true);
		expectSuccess(`"a" == "b"`, false);
	});
});

// Regression: == and != were unconstrained, so a no-Eq type only failed at
// runtime. Now Eq-constrained like Ord's < > — enforced at the call site,
// not shown in a generalized signature (same as <).
describe('==/!= Eq constraint', () => {
	test('comparing a concrete no-Eq-instance type fails during type-checking', () => {
		expectError(
			`{@a 1} == {@a 1}`,
			/No implementation found for operator ==/
		);
	});

	test('!= on a concrete no-Eq-instance type also fails during type-checking', () => {
		expectError(
			`{@a 1} != {@a 1}`,
			/No implementation found for operator !=/
		);
	});

	test('a polymorphic, unresolved == use is not rejected eagerly', () => {
		const { finalType } = runCode(`fn a b => a == b`);
		expect(finalType).toBe('a -> a -> Bool');
	});

	test('== still resolves normally once operands are concrete and Eq-able', () => {
		expectSuccess(`(fn a b => a == b) 1 1`, true);
	});
});
