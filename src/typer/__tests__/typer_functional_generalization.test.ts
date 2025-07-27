import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';

// Helper function to parse a string into a program
const parseProgram = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should generalize polymorphic identity function', () => {
	const program = parseProgram('id = fn x => x');
	const result = typeProgram(program);
	assert.is(typeToString(result.type, result.state.substitution), '(α) -> α');
});

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should allow polymorphic function to be used with different types', () => {
	const program = parseProgram(`
        id = fn x => x;
        num = id 42;
        str = id "hello";
        bool = id True
      `);
	const result = typeProgram(program);
	// The sequence returns the type of the rightmost expression
	assert.is(typeToString(result.type, result.state.substitution), 'Bool');
});

test('Functional Typer - Let-Polymorphism - Core Let-Polymorphism - should handle higher-order functions with generalization', () => {
	const program = parseProgram(`
        apply = fn f x => f x;
        double = fn x => x * 2;
        result = apply double 5
      `);
	const result = typeProgram(program);
	// The sequence returns the type of the rightmost expression
	assert.is(typeToString(result.type, result.state.substitution), 'Float');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle nested function definitions', () => {
	const program = parseProgram(`
        outer = fn x => (
          inner = fn y => x;
          inner 42
        )
      `);
	const result = typeProgram(program);
	// This should work with proper generalization
	assert.is(typeToString(result.type, result.state.substitution), '(α) -> α');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle curried polymorphic functions', () => {
	const program = parseProgram(`
        add = fn x y => x + y;
        addFive = add 5;
        result = addFive 3
      `);
	const result = typeProgram(program);
	assert.is(typeToString(result.type, result.state.substitution), 'Float');
});

test('Functional Typer - Let-Polymorphism - Let-Polymorphism Edge Cases - should handle multiple polymorphic functions in sequence', () => {
	const program = parseProgram(`
        id = fn x => x;
        const = fn x y => x;
        result1 = id 42;
        result2 = const "hello" 123;
        result3 = id True
      `);
	const result = typeProgram(program);
	assert.is(typeToString(result.type, result.state.substitution), 'Bool');
});

test('Functional Typer - Let-Polymorphism - Type Environment Consistency - should properly instantiate polymorphic functions in single program', () => {
	const program = parseProgram(`
        id = fn x => x;
        numResult = id 42;
        strResult = id "hello";
        boolResult = id True;
        numResult
      `);
	const result = typeProgram(program);
	assert.is(typeToString(result.type, result.state.substitution), 'Float');
});

test('Functional Typer - Let-Polymorphism - Type Environment Consistency - should handle polymorphic function with multiple instantiations', () => {
	const program = parseProgram(`
        id = fn x => x;
        id 42;
        id "hello";
        id True
      `);
	const result = typeProgram(program);
	assert.is(typeToString(result.type, result.state.substitution), 'Bool');
});

test.run();
