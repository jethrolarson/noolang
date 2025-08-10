import { describe, test, expect } from 'bun:test';
import { runCode } from '../utils';

describe('Unknown Type Unification Bug', () => {
	test('should unify Unknown types in isString call', () => {
		const code = `
			# This should work now that Unknown type unification is fixed
			test_fn = fn data => isString data;
			test_fn (forget "hello");
		`;

		// This should work now that Unknown types can unify
		expect(() => runCode(code)).not.toThrow();
	});

	test('should unify Unknown types in isNumber call', () => {
		const code = `
			# This should work now that Unknown type unification is fixed
			test_fn = fn data => isNumber data;
			test_fn (forget 42);
		`;

		// This should work now that Unknown types can unify
		expect(() => runCode(code)).not.toThrow();
	});

	test('should unify Unknown types in isBool call', () => {
		const code = `
			# This should work now that Unknown type unification is fixed
			test_fn = fn data => isBool data;
			test_fn (forget (1 == 1));
		`;

		// This should work now that Unknown types can unify
		expect(() => runCode(code)).not.toThrow();
	});

	test('should unify Unknown types in isList call', () => {
		const code = `
			# This should work now that Unknown type unification is fixed
			test_fn = fn data => isList data;
			test_fn (forget [1, 2, 3]);
		`;

		// This should work now that Unknown types can unify
		expect(() => runCode(code)).not.toThrow();
	});
});
