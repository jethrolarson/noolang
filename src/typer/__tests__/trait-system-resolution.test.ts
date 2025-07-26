import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';

describe('Trait System Phase 3: Constraint Resolution', () => {
	describe('Constraint Collapse - Comprehensive', () => {
		test('should handle constraint collapse for various concrete types', () => {
			const testCases = [
				{
					name: 'List with integers',
					code: 'map (fn x => x + 1) [1, 2, 3]',
					expectedKind: 'list',
					expectedType: 'List Int',
					shouldCollapse: true
				},
				{
					name: 'Option with integer',
					code: 'map (fn x => x + 1) (Some 42)',
					expectedKind: 'variant',
					expectedType: 'Option Int',
					shouldCollapse: true
				},
				{
					name: 'Nested map operations',
					code: 'map (fn x => x * 2) (map (fn x => x + 1) [1, 2, 3])',
					expectedKind: 'list',
					expectedType: 'List Int',
					shouldCollapse: true
				},
				{
					name: 'Partial application (no concrete type)',
					code: 'map (fn x => x + 1)',
					expectedKind: 'constrained',
					expectedType: /implements Functor/,
					shouldCollapse: false
				},
				{
					name: 'Pure function (preserves constraint)',
					code: 'pure 1',
					expectedKind: 'constrained',
					expectedType: /implements Monad/,
					shouldCollapse: false
				}
			];

			for (const testCase of testCases) {
				const lexer = new Lexer(testCase.code);
				const tokens = lexer.tokenize();
				const program = parse(tokens);
				
				const typeResult = typeProgram(program);
				const typeString = typeToString(typeResult.type);
				
				// Check type kind
				expect(typeResult.type.kind).toBe(testCase.expectedKind);
				
				// Check type string
				if (typeof testCase.expectedType === 'string') {
					expect(typeString).toBe(testCase.expectedType);
				} else {
					expect(typeString).toMatch(testCase.expectedType);
				}
				
				// Check constraint collapse behavior
				if (testCase.shouldCollapse) {
					expect(typeString).not.toMatch(/implements|given|α\d+/);
				} else {
					expect(typeString).toMatch(/implements|given|α\d+/);
				}
			}
		});
	});

	describe('Constraint Resolution Failures', () => {
		test('should fail when no trait implementation exists', () => {
			const testCases = [
				{
					name: 'Int does not implement Functor',
					code: 'map (fn x => x + 1) 42',
					expectedError: /No implementation of Functor for Int/
				},
				{
					name: 'String does not implement Functor',
					code: 'map (fn x => x + 1) "hello"',
					expectedError: /No implementation of Functor for String/
				}
			];

			for (const testCase of testCases) {
				expect(() => {
					const lexer = new Lexer(testCase.code);
					const tokens = lexer.tokenize();
					const program = parse(tokens);
					typeProgram(program);
				}).toThrow(testCase.expectedError);
			}
		});

		test('should fail when trying to use non-existent trait', () => {
			const code = 'result = unknownTraitFunction 42';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			expect(() => typeProgram(program)).toThrow(/Undefined variable/);
		});
	});

	describe('Complex Constraint Resolution', () => {
		test('should handle partial application with constraint preservation', () => {
			const code = 'mapIncrement = map (fn x => x + 1)';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should return a function type with constraints
			expect(typeResult.type.kind).toBe('constrained');
			if (typeResult.type.kind === 'constrained') {
				expect(typeResult.type.baseType.kind).toBe('function');
			}
			
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
			expect(typeString).toMatch(/-> .* Int/); // Should be a function returning constrained Int
		});

		test('should handle multiple different constraints with partial collapse', () => {
			const code = `
				showAndIncrement = fn x => show (x + 1);
				result = map showAndIncrement [1, 2, 3]
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// PARTIAL CONSTRAINT COLLAPSE: Functor constraint gets resolved to List,
			// but Show constraint from within the mapped function is preserved
			expect(typeResult.type.kind).toBe('list');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/List String/);
			expect(typeString).toMatch(/implements Show/); // Show constraint preserved for now
		});
	});

	describe('Integration with Existing System', () => {
		test('should not break existing type inference', () => {
			const code = `
				simpleFunction = fn x => x + 1;
				result = simpleFunction 42
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should work normally without constraints
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('Int');
			}
		});

		test('should work with let polymorphism', () => {
			const code = `
				identity = fn x => x;
				stringResult = identity "hello";
				intResult = identity 42
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should succeed - polymorphic function used with different types
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('Int'); // Last definition wins
			}
		});

		test('should integrate with ADT pattern matching', () => {
			const code = `
				handleOption = fn opt => match opt with (
					Some x => show x;
					None => "nothing"
				);
				result = map handleOption [Some 1, None, Some 2]
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should handle complex integration of constraints, ADTs, and pattern matching
			expect(typeResult.type.kind).toBe('list');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/String/);
		});
	});

	describe('Advanced Edge Cases', () => {
		test('should handle polymorphic functions with constraints', () => {
			const code = `
				polymorphicMap = fn f list => map f list;
				result = polymorphicMap (fn x => x + 1) [1, 2, 3]
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should propagate constraints through polymorphic functions
			expect(typeResult.type.kind).toBe('constrained');
		});
	});
});