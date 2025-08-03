import { test, expect } from 'bun:test';
import { expectError, runCode } from '../../utils';

// Test suite: Basic Functionality
test('should apply function to Some value', () => {
	const result = runCode(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 15 }],
	});
});

test('should short-circuit on None', () => {
	const result = runCode(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should work with inline function', () => {
	const result = runCode(`Some 10 |? (fn x => x * 2)`);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 20 }],
	});
});

// Test suite: Monadic Bind Behavior
test('should handle function returning Option (monadic bind)', () => {
	const result = runCode(`
        double_wrap = fn x => Some (x * 2);
        Some 5 |? double_wrap
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 10 }],
	});
});

test('should return None when function returns None', () => {
	const result = runCode(`
        always_none = fn x => None;
        Some 10 |? always_none
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should not double-wrap Option results', () => {
	const result = runCode(`
        wrap_some = fn x => Some (x + 1);
        Some 5 |? wrap_some
      `);
	// Result should be Some 6, not Some (Some 6)
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 6 }],
	});
});

// Test suite: Chaining
test('should support chaining multiple |? operations', () => {
	const result = runCode(`
        add_one = fn x => x + 1;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? multiply_two
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('should short-circuit in chains when None encountered', () => {
	const result = runCode(`
        add_one = fn x => x + 1;
        to_none = fn x => None;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? to_none |? multiply_two
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should work with mixed regular and Option-returning functions', () => {
	const result = runCode(`
        add_one = fn x => x + 1;
        safe_wrap = fn x => Some (x * 2);
        Some 5 |? add_one |? safe_wrap
      `);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

// Test suite: Type Checking
test('should infer Option type for result', () => {
	const result = runCode(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
	expect(result.finalType).toMatch(/Option/);
});

test('should handle None type correctly', () => {
	const result = runCode(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
	expect(result.finalType).toMatch(/Option/);
});

// Test suite: Error Cases
test('should require right operand to be a function', () => {
	expectError(`Some 5 |? 10`, /Cannot apply non-function type/);
});
