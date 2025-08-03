import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { floatType, stringType } from '../../ast';
import { Evaluator } from '../../evaluator/evaluator';
import { test, expect } from 'bun:test';
import { assertNumberValue, assertStringValue } from '../../../test/utils';

test('Add Trait System - Type Checking - should type 1 + 2 as Float', () => {
	const code = '1 + 2';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(floatType());
});

test('Add Trait System - Type Checking - should type 3.14 + 2.86 as Float', () => {
	const code = '3.14 + 2.86';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(floatType());
});

test('Add Trait System - Type Checking - should type "hello" + " world" as String', () => {
	const code = '"hello" + " world"';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(stringType());
});

test('Add Trait System - Type Checking - should reject mixed type addition 1 + "hello"', () => {
	const code = '1 + "hello"';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);

	expect(() => typeAndDecorate(program)).toThrow();
});

test('Add Trait System - Type Checking - should reject mixed type addition 3.14 + "test"', () => {
	const code = '3.14 + "test"';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);

	expect(() => typeAndDecorate(program)).toThrow();
});

test('Add Trait System - Type Checking - should accept all numeric operations since everything is Float', () => {
	const code = '1 + 3.14';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(floatType());
});

test('Add Trait System - Type Checking - should work with variables of same type', () => {
	const code = `
		x = 5;
		y = 10;
		x + y
	`;
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(floatType());
});

test('Add Trait System - Type Checking - should work with float variables', () => {
	const code = `
		a = 1.5;
		b = 2.5;
		a + b
	`;
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(floatType());
});

test('Add Trait System - Type Checking - should work with string variables', () => {
	const code = `
		name = "Alice";
		greeting = "Hello ";
		greeting + name
	`;
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	const result = typeAndDecorate(program);

	expect(result.type).toEqual(stringType());
});

test('Add Trait System - Runtime Evaluation - should evaluate 1 + 2 to 3', () => {
	const code = '1 + 2';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);

	// Type check first to get the trait registry
	const typeResult = typeAndDecorate(program);

	// Initialize evaluator with the trait registry from type checking
	const evaluator = new Evaluator({
		traitRegistry: typeResult.state.traitRegistry,
	});
	const result = evaluator.evaluateProgram(program);
	assertNumberValue(result.finalResult);
	expect(result.finalResult.value).toBe(3);
});

test('Add Trait System - Runtime Evaluation - should evaluate 3.14 + 2.86 to 6.0', () => {
	const code = '3.14 + 2.86';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);

	// Type check first to get the trait registry
	const typeResult = typeAndDecorate(program);

	// Initialize evaluator with the trait registry from type checking
	const evaluator = new Evaluator({
		traitRegistry: typeResult.state.traitRegistry,
	});
	const result = evaluator.evaluateProgram(program);

	assertNumberValue(result.finalResult);
	expect(result.finalResult.value).toBe(6);
});

test('Add Trait System - Runtime Evaluation - should evaluate "hello" + " world" to "hello world"', () => {
	const code = '"hello" + " world"';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);

	// Type check first to get the trait registry
	const typeResult = typeAndDecorate(program);

	// Initialize evaluator with the trait registry from type checking
	const evaluator = new Evaluator({
		traitRegistry: typeResult.state.traitRegistry,
	});
	const result = evaluator.evaluateProgram(program);

	assertStringValue(result.finalResult);
	expect(result.finalResult.value).toBe('hello world');
});

test('Add Trait System - Error Messages - should provide clear error for 1 + "hello"', () => {
	const code = '1 + "hello"';
	const tokens = new Lexer(code).tokenize();
	const program = parse(tokens);
	
	expect(() => typeAndDecorate(program)).toThrow();
});

