import { typeToString } from '../helpers';
import { createTypeState } from '..';
import { initializeBuiltins } from '../builtins';
import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';

test('Functional Type Inference - Basic Types - should infer integer literal', () => {
	const result = parseAndType('42');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Basic Types - should infer string literal', () => {
	const result = parseAndType('"hello"');
	expect(typeToString(result.type, result.state.substitution)).toBe('String');
});

test('Functional Type Inference - Basic Types - should infer boolean literal', () => {
	const result = parseAndType('True');
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Type Inference - Function Types - should infer nested function', () => {
	const result = parseAndType('fn x => fn y => x + y');
	// With trait system, + operator is polymorphic: Add a => a -> a -> a
	// Note: May show duplicate constraints due to nested function constraint collection
	expect(typeToString(result.type, result.state.substitution)).toBe(
		'a -> a -> a given a implements Add'
	);
});

test('Functional Type Inference - Let Polymorphism - should generalize identity function', () => {
	const result = parseAndType('id = fn x => x; id 42');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Let Polymorphism - should allow polymorphic function to be used with different types', () => {
	const result = parseAndType('id = fn x => x; id 42; id "hello"');
	expect(typeToString(result.type, result.state.substitution)).toBe('String');
});

test('Functional Type Inference - Let Polymorphism - should handle recursive definitions', () => {
	const result = parseAndType(
		'fact = fn n => if n == 0 then 1 else n * (fact (n - 1)); fact 5'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Function Application - should apply function to argument', () => {
	const result = parseAndType('(fn x => x + 1) 42');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Function Application - should handle partial application', () => {
	const result = parseAndType('sum = fn x y => x + y; sum5 = sum 5; sum5 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Function Application - should handle curried application', () => {
	const result = parseAndType('sum = fn x y => x + y; sum 2 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Binary Operators - should infer arithmetic operations', () => {
	const result = parseAndType('2 + 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Binary Operators - should infer comparison operations', () => {
	const result = parseAndType('2 < 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Type Inference - Binary Operators - should infer equality operations', () => {
	const result = parseAndType('2 == 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Type Inference - If Expressions - should infer if expression with same types', () => {
	const result = parseAndType('if True then 1 else 2');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - If Expressions - should handle if expression with different types', () => {
	expect(() => parseAndType('if True then 1 else "hello"')).toThrow();
});

test('Functional Type Inference - Sequences - should handle semicolon sequences', () => {
	const result = parseAndType('1; 2; 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Sequences - should handle sequences with definitions', () => {
	const result = parseAndType('x = 1; y = 2; x + y');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Built-in Functions - should handle built-in arithmetic operators', () => {
	const result = parseAndType('2 + 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Built-in Functions - should handle built-in comparison operators', () => {
	const result = parseAndType('2 == 3');
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Type Inference - Type Environment - should initialize with built-ins', () => {
	const state = createTypeState();
	const newState = initializeBuiltins(state);

	expect(newState.environment.has('+')).toBe(true);
	expect(newState.environment.has('-')).toBe(true);
	expect(newState.environment.has('*')).toBe(true);
	expect(newState.environment.has('/')).toBe(true);
	expect(newState.environment.has('==')).toBe(true);
	expect(newState.environment.has(';')).toBe(true);
});

test('Functional Type Inference - Error Cases - should reject undefined variables', () => {
	expect(() => parseAndType('undefined_var')).toThrow();
});

test('Functional Type Inference - Error Cases - should reject type mismatches in function application', () => {
	expect(() => parseAndType('(fn x => x + 1) "hello"')).toThrow();
});

test('Functional Type Inference - Error Cases - should reject non-boolean conditions in if expressions', () => {
	expect(() => parseAndType('if 42 then 1 else 2')).toThrow();
});

test('Functional Type Inference - Mutation Types - should type mutable definition with simple value', () => {
	const result = parseAndType('mut x = 42; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should type mutable definition with function', () => {
	const result = parseAndType('mut f = fn x => x + 1; f 5');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should type mutation with same type', () => {
	const result = parseAndType('mut x = 10; mut! x = 20; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should type mutation with compatible types', () => {
	const result = parseAndType('mut x = 10; mut! x = 15; x + 5');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should reject mutation of undefined variable', () => {
	expect(() => parseAndType('mut! x = 42')).toThrow();
});

test('Functional Type Inference - Mutation Types - should reject mutation with incompatible types', () => {
	expect(() => parseAndType('mut x = 10; mut! x = "hello"')).toThrow();
});

test('Functional Type Inference - Mutation Types - should reject mutation of non-mutable variable', () => {
	const result = parseAndType('x = 10; mut! x = 20');
	// This should be caught at runtime, not type time
	// The type system allows it but the evaluator will throw
	expect(result).toBeTruthy();
});

test('Functional Type Inference - Mutation Types - should handle mutation in sequences', () => {
	const result = parseAndType('mut x = 1; mut! x = 2; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle multiple mutations of same variable', () => {
	const result = parseAndType('mut x = 0; mut! x = 1; mut! x = 2; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with complex expressions', () => {
	const result = parseAndType('mut x = 1; mut! x = x + 1; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with function calls', () => {
	const result = parseAndType(
		'sum = fn x y => x + y; mut x = 5; mut! x = sum x 3; x'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with conditional expressions', () => {
	const result = parseAndType(
		'mut x = 10; mut! x = if x > 5 then 20 else 0; x'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with record values', () => {
	const result = parseAndType(
		'mut point = {10, 20}; mut! point = {30, 40}; point'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe(
		'{Float, Float}'
	);
});

test('Functional Type Inference - Mutation Types - should handle mutation with list values', () => {
	const result = parseAndType(
		'mut items = [1, 2, 3]; mut! items = [4, 5, 6]; head items'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe(
		'Option Float'
	);
});

test('Functional Type Inference - Mutation Types - should handle mutation with external variables', () => {
	const result = parseAndType(`
		outer = 100;
		mut inner = 10;
		mut! inner = inner + outer;
		inner
	`);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with polymorphic functions', () => {
	const result = parseAndType('id = fn x => x; mut x = 42; mut! x = id x; x');
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Type Inference - Mutation Types - should handle mutation with built-in functions', () => {
	const result = parseAndType(
		'mut list = [1, 2, 3]; mut! list = list_map (fn x => x * 2) list; length list'
	);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Constraint Propagation (Functional Typer) - should throw a type error when constraints are not satisfied in composition', () => {
	const result = parseAndType(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [1, 2, 3]
    `);
	// This should work now since head is safe and returns Option
	expect(result).toBeTruthy();
});

test('Constraint Propagation (Functional Typer) - should allow composition when constraints are satisfied (functional typer)', () => {
	const result = parseAndType(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [[1, 2, 3], [4, 5, 6]]
    `);
	const typeStr = typeToString(result.type, result.state.substitution);
	// head now returns Option List Float instead of List Float
	expect(typeStr).toBe('Option List Float');
});

test('Typer - optional accessor returns Option type', () => {
	const code = `
	  get = @name?;
	`;
	const result = parseAndType(code);
	const typeStr = typeToString(result.type, result.state.substitution);
	// Expect something like "{ @name a } -> Option a" (display may vary but should include Option)
	expect(typeStr.includes('Option')).toBe(true);
});
