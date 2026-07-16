import { test, describe } from 'bun:test';
import { expectSuccess } from '../../../test/utils';

describe('&& / || (short-circuiting logical operators)', () => {
	test('&& truth table', () => {
		expectSuccess('True && True', true);
		expectSuccess('True && False', false);
		expectSuccess('False && True', false);
		expectSuccess('False && False', false);
	});

	test('|| truth table', () => {
		expectSuccess('True || True', true);
		expectSuccess('True || False', true);
		expectSuccess('False || True', true);
		expectSuccess('False || False', false);
	});

	test('&& binds tighter than ||', () => {
		// False && False || True  ==  (False && False) || True  ==  True
		expectSuccess('False && False || True', true);
	});

	test('&& short-circuits: right side is not evaluated when left is False', () => {
		// readFile on a nonexistent path throws at evaluation time (verified:
		// evaluating this expression unguarded does throw). If && evaluated
		// the right side anyway despite the left being False, this would
		// throw instead of returning False.
		expectSuccess(
			'False && (match (readFile "/nonexistent/path/should/not/be/read") (_ => True))',
			false
		);
	});

	test('|| short-circuits: right side is not evaluated when left is True', () => {
		expectSuccess(
			'True || (match (readFile "/nonexistent/path/should/not/be/read") (_ => False))',
			true
		);
	});

	test('(&&) and (||) work as sectioned first-class functions', () => {
		expectSuccess('(&&) True False', false);
		expectSuccess('(||) True False', true);
	});
});
