import { test, describe, expect } from 'bun:test';
import { expectSuccess, expectError, runCode } from '../../utils';

// Regression: == and != fell through to a primitives-only native whose
// default case returned False, so every variant/list comparison was silently
// wrong. They now dispatch through the Eq trait like + dispatches through Add.
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

// Regression: == was typed as unconstrained `a -> a -> Bool`, so a type with
// no Eq instance (records have none) only failed inside the evaluator's
// trait-resolution fallback — the type system waved it through with no
// static check at all. == and != now carry the operator-scheme constraint
// `given a implements Eq`, the same mechanism `<`/`>`/Ord already use: a
// concrete no-instance type is rejected during typeBinary (before
// evaluation), while an unresolved polymorphic use defers the constraint
// rather than erroring. (Note: like Ord, this constraint is enforced at the
// call site and does not appear in the generalized function type's printed
// signature the way Add's does — different mechanism, same static coverage.)
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
