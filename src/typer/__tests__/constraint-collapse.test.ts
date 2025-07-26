import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';

describe('Constraint Collapse', () => {
	describe('When concrete types are provided', () => {
		test('should collapse constraint to List Int for map (fn a => a + 1) [1]', () => {
			// RED: This test should fail initially
			const code = 'map (fn a => a + 1) [1]';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// EXPECTED: Should be List Int, not a constrained type
			expect(typeResult.type.kind).toBe('list');
			if (typeResult.type.kind === 'list') {
				expect(typeResult.type.element.kind).toBe('primitive');
				if (typeResult.type.element.kind === 'primitive') {
					expect(typeResult.type.element.name).toBe('Int');
				}
			}
			
			// Alternative: check the string representation
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('List Int');
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		});

		test('should collapse constraint to Option Int for map (fn a => a + 1) (Some 1)', () => {
			// RED: This test should fail initially
			const code = 'map (fn a => a + 1) (Some 1)';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// EXPECTED: Should be Option Int, not a constrained type
			expect(typeResult.type.kind).toBe('variant');
			if (typeResult.type.kind === 'variant') {
				expect(typeResult.type.name).toBe('Option');
				expect(typeResult.type.args).toHaveLength(1);
				expect(typeResult.type.args[0].kind).toBe('primitive');
				if (typeResult.type.args[0].kind === 'primitive') {
					expect(typeResult.type.args[0].name).toBe('Int');
				}
			}
			
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('Option Int');
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		});

		test('should preserve constraints when concrete type is not provided', () => {
			// GREEN: This should continue working - constraints preserved when needed
			const code = 'map (fn a => a + 1)';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// This should still be constrained since no concrete type is provided
			expect(typeResult.type.kind).toBe('constrained');
			
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
		});

		test('should collapse multiple constraints correctly', () => {
			// GREEN: Simplified test case without pipeline operators
			const code = 'map (fn x => x * 2) (map (fn x => x + 1) [1, 2, 3])';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should collapse to List Int, not preserve constraints
			expect(typeResult.type.kind).toBe('list');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('List Int');
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		});
	});

	describe('Edge cases', () => {
		test('should handle simple nested types', () => {
			// GREEN: Simplified test for nested constraints 
			const code = 'map (fn x => x + 1) (Some 42)';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should be Option Int
			expect(typeResult.type.kind).toBe('variant');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('Option Int');
		});
	});
});