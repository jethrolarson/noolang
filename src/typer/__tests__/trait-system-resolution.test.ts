import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';

describe('Trait System Phase 3: Constraint Resolution', () => {
	describe('Basic Constraint Resolution', () => {
		test('should resolve Functor constraint for List', () => {
			const code = 'result = map (fn x => x + 1) [1, 2, 3]';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// CONSTRAINT COLLAPSE: Should succeed and return concrete List Int type
			expect(typeResult.type.kind).toBe('list');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('List Int');
			// Should NOT have constraint annotations anymore
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		});

		test('should resolve Functor constraint for Option', () => {
			const code = 'result = map (fn x => x + 1) (Some 42)';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// CONSTRAINT COLLAPSE: Should succeed and return concrete Option Int type
			expect(typeResult.type.kind).toBe('variant');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toBe('Option Int');
			// Should NOT have constraint annotations anymore
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		});

		test('should resolve Show constraint for Int', () => {
			const code = 'result = show 42';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should succeed and return String
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('String');
			}
		});

		test('should resolve Monad constraint polymorphically', () => {
			const code = 'result = pure 42';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should succeed and return a constrained type
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Monad/);
		});
	});

	describe('Constraint Resolution Failures', () => {
		test('should fail when no trait implementation exists', () => {
			const code = 'result = map (fn x => x + 1) "hello"';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			expect(() => typeProgram(program)).toThrow(/No implementation of Functor for String/);
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

		test('should handle nested function applications', () => {
			// This tests multiple constraint resolutions in sequence
			const code = `
				increment = fn x => x + 1;
				double = fn x => x * 2;
				result = map double (map increment [1, 2, 3])
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should succeed with constraint resolution at each step
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
		});

		test('should handle multiple different constraints', () => {
			const code = `
				showAndIncrement = fn x => show (x + 1);
				result = map showAndIncrement [1, 2, 3]
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should handle both Functor constraint on map and implicit Show constraint
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/String/);
			expect(typeString).toMatch(/implements Functor/);
		});
	});

	describe('Higher-Kinded Type Support', () => {
		test('should handle type constructor substitution correctly', () => {
			// This tests the core α130 Int → List Int transformation
			const code = 'listResult = map (fn x => x + 1) [1, 2, 3]';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// The constraint should be properly resolved during unification
			expect(typeResult.type.kind).toBe('constrained');
			
			// The base type should be a variant representing the functor application
			if (typeResult.type.kind === 'constrained') {
				const baseType = typeResult.type.baseType;
				expect(baseType.kind).toBe('variant');
				if (baseType.kind === 'variant') {
					expect(baseType.args.length).toBe(1);
					expect(baseType.args[0].kind).toBe('primitive');
					if (baseType.args[0].kind === 'primitive') {
						expect(baseType.args[0].name).toBe('Int');
					}
				}
			}
		});

		test('should work with different functor types', () => {
			const tests = [
				{ code: 'map (fn x => x + 1) [1, 2, 3]', description: 'List' },
				{ code: 'map (fn x => x + 1) (Some 1)', description: 'Option' },
			];

			for (const testCase of tests) {
				const lexer = new Lexer(testCase.code);
				const tokens = lexer.tokenize();
				const program = parse(tokens);
				
				const typeResult = typeProgram(program);
				
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/implements Functor/);
			}
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
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/String/);
			expect(typeString).toMatch(/implements Functor/);
		});
	});

	describe('Error Message Quality', () => {
		test('should provide helpful error for missing trait implementation', () => {
			const code = 'result = map (fn x => x + 1) 42'; // Int doesn't implement Functor
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			try {
				typeProgram(program);
				fail('Expected error for missing trait implementation');
			} catch (error) {
				const message = (error as Error).message;
				expect(message).toMatch(/Functor/);
				expect(message).toMatch(/Int/);
				// Should suggest how to fix it
				expect(message).toMatch(/implement/);
			}
		});

		test('should provide clear error location information', () => {
			const code = 'result = map (fn x => x + 1) "hello"';
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			try {
				typeProgram(program);
				fail('Expected error for missing trait implementation');
			} catch (error) {
				const message = (error as Error).message;
				// Should include location information
				expect(message).toMatch(/line 1/);
			}
		});
	});

	describe('Performance and Edge Cases', () => {
		test('should handle deeply nested constraint resolution', () => {
			const code = `
				f1 = fn x => x + 1;
				f2 = fn x => x * 2;
				f3 = fn x => x - 1;
				result = map f3 (map f2 (map f1 [1, 2, 3]))
			`;
			
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			
			const typeResult = typeProgram(program);
			
			// Should handle multiple levels of constraint resolution
			expect(typeResult.type.kind).toBe('constrained');
		});

		test('should handle constraint resolution with type variables', () => {
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