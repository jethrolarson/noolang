import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { initializeTypeState } from '../types';
import { typeToString } from '../helpers';
import { floatType, intType, stringType } from '../../ast';

describe('Add Trait System', () => {
	describe('Type Checking', () => {
		test('should type 1 + 2 as Int', () => {
			const code = '1 + 2';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(intType());
		});

		test('should type 3.14 + 2.86 as Float', () => {
			const code = '3.14 + 2.86';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(floatType());
		});

		test('should type "hello" + " world" as String', () => {
			const code = '"hello" + " world"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(stringType());
		});

		test('should reject mixed type addition 1 + "hello"', () => {
			const code = '1 + "hello"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			
			expect(() => typeAndDecorate(program, state)).toThrow();
		});

		test('should reject mixed type addition 3.14 + "test"', () => {
			const code = '3.14 + "test"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			
			expect(() => typeAndDecorate(program, state)).toThrow();
		});

		test('should reject mixed numeric types 1 + 3.14', () => {
			const code = '1 + 3.14';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			
			expect(() => typeAndDecorate(program, state)).toThrow();
		});

		test('should work with variables of same type', () => {
			const code = `
				x = 5;
				y = 10;
				x + y
			`;
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(intType());
		});

		test('should work with float variables', () => {
			const code = `
				a = 1.5;
				b = 2.5;
				a + b
			`;
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(floatType());
		});

		test('should work with string variables', () => {
			const code = `
				name = "Alice";
				greeting = "Hello ";
				greeting + name
			`;
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			const result = typeAndDecorate(program, state);
			
			expect(result.finalType).toEqual(stringType());
		});
	});

	describe('Runtime Evaluation', () => {
		test('should evaluate 1 + 2 to 3', () => {
			// This test will be written once we verify type checking works
		});

		test('should evaluate 3.14 + 2.86 to 6.0', () => {
			// This test will be written once we verify type checking works
		});

		test('should evaluate "hello" + " world" to "hello world"', () => {
			// This test will be written once we verify type checking works
		});
	});

	describe('Error Messages', () => {
		test('should provide clear error for 1 + "hello"', () => {
			const code = '1 + "hello"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const state = initializeTypeState();
			
			expect(() => typeAndDecorate(program, state)).toThrow(/constraint.*Add/i);
		});
	});
});