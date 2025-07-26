import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate, createTypeState } from '../index';
import { typeToString } from '../helpers';
import { floatType, intType, stringType } from '../../ast';
import { Evaluator } from '../../evaluator/evaluator';

describe('Add Trait System', () => {
	describe('Type Checking', () => {
		test('should type 1 + 2 as Int', () => {
			const code = '1 + 2';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const result = typeAndDecorate(program);
			
			expect(result.finalType).toEqual(intType());
		});

		test('should type 3.14 + 2.86 as Float', () => {
			const code = '3.14 + 2.86';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const result = typeAndDecorate(program);
			
			expect(result.finalType).toEqual(floatType());
		});

		test('should type "hello" + " world" as String', () => {
			const code = '"hello" + " world"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const result = typeAndDecorate(program);
			
			expect(result.finalType).toEqual(stringType());
		});

		test('should reject mixed type addition 1 + "hello"', () => {
			const code = '1 + "hello"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			expect(() => typeAndDecorate(program)).toThrow();
		});

		test('should reject mixed type addition 3.14 + "test"', () => {
			const code = '3.14 + "test"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			expect(() => typeAndDecorate(program)).toThrow();
		});

		test('should reject mixed numeric types 1 + 3.14', () => {
			const code = '1 + 3.14';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			expect(() => typeAndDecorate(program)).toThrow();
		});

		test('should work with variables of same type', () => {
			const code = `
				x = 5;
				y = 10;
				x + y
			`;
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			const result = typeAndDecorate(program);
			
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
			const result = typeAndDecorate(program);
			
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
			const result = typeAndDecorate(program);
			
			expect(result.finalType).toEqual(stringType());
		});
	});

	describe('Runtime Evaluation', () => {
		test('should evaluate 1 + 2 to 3', () => {
			const code = '1 + 2';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			// Type check first to get the trait registry
			const typeResult = typeAndDecorate(program);
			
			// Initialize evaluator with the trait registry from type checking
			const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
			const result = evaluator.evaluateProgram(program);
			
			expect(result.finalResult.tag).toBe('number');
			if (result.finalResult.tag === 'number') {
				expect(result.finalResult.value).toBe(3);
			}
		});

		test('should evaluate 3.14 + 2.86 to 6.0', () => {
			const code = '3.14 + 2.86';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			// Type check first to get the trait registry
			const typeResult = typeAndDecorate(program);
			
			// Initialize evaluator with the trait registry from type checking
			const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
			const result = evaluator.evaluateProgram(program);
			
			expect(result.finalResult.tag).toBe('number');
			if (result.finalResult.tag === 'number') {
				expect(result.finalResult.value).toBe(6);
			}
		});

		test('should evaluate "hello" + " world" to "hello world"', () => {
			const code = '"hello" + " world"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			// Type check first to get the trait registry
			const typeResult = typeAndDecorate(program);
			
			// Initialize evaluator with the trait registry from type checking
			const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
			const result = evaluator.evaluateProgram(program);
			
			expect(result.finalResult.tag).toBe('string');
			if (result.finalResult.tag === 'string') {
				expect(result.finalResult.value).toBe('hello world');
			}
		});
	});

	describe('Error Messages', () => {
		test('should provide clear error for 1 + "hello"', () => {
			const code = '1 + "hello"';
			const tokens = new Lexer(code).tokenize();
			const program = parse(tokens);
			
			expect(() => typeAndDecorate(program)).toThrow(/Operator type mismatch|Expected.*Int.*Got.*String/i);
		});
	});
});