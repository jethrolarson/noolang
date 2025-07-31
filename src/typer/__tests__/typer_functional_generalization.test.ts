import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';
import { test, expect } from 'bun:test';

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should generalize polymorphic identity function', () => {
	const result = parseAndType('id = fn x => x');
	expect(typeToString(result.type, result.state.substitution)).toBe('(α) -> α');
});

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should allow polymorphic function to be used with different types', () => {
	const result = parseAndType(`
        id = fn x => x;
        num = id 42;
        str = id "hello";
        bool = id True
      `);
	// The sequence returns the type of the rightmost expression
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should handle higher-order functions with generalization', () => {
	const result = parseAndType(`
        applyFn = fn f x => f x;
        double = fn x => x * 2;
        result = applyFn double 5
      `);
	// The sequence returns the type of the rightmost expression
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle nested function definitions', () => {
	const result = parseAndType(`
        outer = fn x => (
          inner = fn y => x;
          inner 42
        )
      `);
	// This should work with proper generalization
	expect(typeToString(result.type, result.state.substitution)).toBe('(α) -> α');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle curried polymorphic functions', () => {
	const result = parseAndType(`
        sum = fn x y => x + y;
        sumFive = sum 5;
        result = sumFive 3
      `);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle multiple polymorphic functions in sequence', () => {
	const result = parseAndType(`
        id = fn x => x;
        const = fn x y => x;
        result1 = id 42;
        result2 = const "hello" 123;
        result3 = id True
      `);
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});

test('Functional Typer - Let-Polymorphism - Type Environment Consistency - should properly instantiate polymorphic functions in single program', () => {
	const result = parseAndType(`
        id = fn x => x;
        numResult = id 42;
        strResult = id "hello";
        boolResult = id True;
        numResult
      `);
	expect(typeToString(result.type, result.state.substitution)).toBe('Float');
});

test('Functional Typer - Let-Polymorphism - Type Environment Consistency - should handle polymorphic function with multiple instantiations', () => {
	const result = parseAndType(`
        id = fn x => x;
        id 42;
        id "hello";
        id True
      `);
	expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
});
