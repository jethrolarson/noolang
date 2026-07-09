/**
 * Tests that `reduce` (and peer list builtins) accept bare trait functions
 * as the reducer/callback argument.
 *
 * Regression: previously `reduce add 0 [1,2,3]` threw
 * "reduce requires a function, initial value, a list" because the runtime
 * check only allowed ordinary function/native-function values and did not
 * handle the `trait-function` value kind.
 */
import { describe, test, expect } from 'bun:test';
import { expectSuccess, expectError } from '../../../test/utils';

describe('reduce with bare trait functions', () => {
	test('reduce add 0 [1,2,3] → 6', () => {
		expectSuccess('reduce add 0 [1,2,3]', 6);
	});

	test('reduce add 0 [] → 0 (empty list)', () => {
		expectSuccess('reduce add 0 []', 0);
	});

	test('reduce multiply 1 [1,2,3,4] → 24', () => {
		expectSuccess('reduce multiply 1 [1,2,3,4]', 24);
	});

	test('reduce subtract 10 [1,2,3] → 4', () => {
		// 10 - 1 = 9, 9 - 2 = 7, 7 - 3 = 4
		expectSuccess('reduce subtract 10 [1,2,3]', 4);
	});

	test('reduce still works with a plain lambda', () => {
		expectSuccess('reduce (fn acc x => acc + x) 0 [1,2,3]', 6);
	});

	test('result has Float type', () => {
		const result = expectSuccess('reduce add 0 [1,2,3]');
		expect(result.finalType).toBe('Float');
	});

	test('reduce add works with single-element list', () => {
		expectSuccess('reduce add 0 [42]', 42);
	});
});
