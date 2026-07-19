import { test, describe } from 'bun:test';
import { expectSuccess } from '../../utils';

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
