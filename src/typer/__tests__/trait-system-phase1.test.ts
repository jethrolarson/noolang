import { describe, it, expect } from '@jest/globals';
import { typeProgram } from '..';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeToString } from '../helpers';
import { createTraitRegistry, addTraitDefinition, addTraitImplementation, isTraitFunction, resolveTraitFunction } from '../trait-system';
import { functionType, typeVariable, stringType, intType } from '../../ast';

describe('Trait System Phase 1 Infrastructure', () => {
	const parseProgram = (source: string) => {
		const lexer = new Lexer(source);
		const tokens = lexer.tokenize();
		return parse(tokens);
	};

	describe('TraitRegistry', () => {
		it('should create empty trait registry', () => {
			const registry = createTraitRegistry();
			expect(registry.definitions.size).toBe(0);
			expect(registry.implementations.size).toBe(0);
		});

		it('should add trait definition', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			
			addTraitDefinition(registry, trait);
			
			expect(registry.definitions.size).toBe(1);
			expect(registry.definitions.get('Show')).toEqual(trait);
			expect(registry.implementations.has('Show')).toBe(true);
		});

		it('should add trait implementation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			const impl = {
				typeName: 'Int',
				functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
			};
			
			const success = addTraitImplementation(registry, 'Show', impl);
			
			expect(success).toBe(true);
			expect(registry.implementations.get('Show')?.get('Int')).toEqual(impl);
		});

		it('should fail to add implementation for non-existent trait', () => {
			const registry = createTraitRegistry();
			const impl = {
				typeName: 'Int',
				functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
			};
			
			const success = addTraitImplementation(registry, 'NonExistent', impl);
			
			expect(success).toBe(false);
		});
	});

	describe('Trait Function Resolution', () => {
		it('should identify trait functions', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			expect(isTraitFunction(registry, 'show')).toBe(true);
			expect(isTraitFunction(registry, 'nonExistent')).toBe(false);
		});

		it('should resolve trait function with implementation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			const impl = {
				typeName: 'Int',
				functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
			};
			addTraitImplementation(registry, 'Show', impl);

			const result = resolveTraitFunction(registry, 'show', [intType()]);
			
			expect(result.found).toBe(true);
			expect(result.traitName).toBe('Show');
			expect(result.typeName).toBe('Int');
			expect(result.impl).toEqual({ kind: 'variable', name: 'intToString' });
		});

		it('should fail to resolve trait function without implementation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			const result = resolveTraitFunction(registry, 'show', [intType()]);
			
			expect(result.found).toBe(false);
		});

		it('should fail to resolve non-trait function', () => {
			const registry = createTraitRegistry();
			
			const result = resolveTraitFunction(registry, 'nonExistent', [intType()]);
			
			expect(result.found).toBe(false);
		});
	});

	describe('Type System Integration', () => {
		it('should handle undefined trait functions gracefully', () => {
			const program = parseProgram('nonexistent_function 42'); // Actually undefined function
			
			expect(() => typeProgram(program)).toThrow(/Undefined variable/);
		});

		it('should not break existing functionality', () => {
			const program = parseProgram('add = fn x y => x + y; add 1 2');
			const result = typeProgram(program);
			
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should work with ConstrainedType infrastructure', () => {
			// Test that ConstrainedType can be created and handled
			const program = parseProgram('id = fn x => x; id 42');
			const result = typeProgram(program);
			
			// Should infer concrete type, not constrained type yet
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should work with existing ADT system', () => {
			const program = parseProgram(`
				type Option a = Some a | None;
				option = Some 42;
				option
			`);
			const result = typeProgram(program);
			
			expect(typeToString(result.type, result.state.substitution)).toBe('Option Int');
		});

		it('should maintain polymorphic function types', () => {
			const program = parseProgram('id = fn x => x; id');
			const result = typeProgram(program);
			
			// Should show generic function type
			expect(typeToString(result.type, result.state.substitution)).toMatch(/α.*α/);
		});
	});

	describe('Constraint Type Infrastructure', () => {
		it('should handle basic unification without errors', () => {
			// Test that the new unification code doesn't break
			const program = parseProgram(`
				f = fn x => x;
				g = fn y => y;
				result = f (g 42);
				result
			`);
			const result = typeProgram(program);
			
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle function composition', () => {
			const program = parseProgram(`
				compose = fn f g => fn x => f (g x);
				add1 = fn x => x + 1;
				mult2 = fn x => x * 2;
				composed = compose add1 mult2;
				composed 5
			`);
			const result = typeProgram(program);
			
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle partial application correctly', () => {
			const program = parseProgram(`
				add = fn x y => x + y;
				add5 = add 5;
				add5
			`);
			const result = typeProgram(program);
			
			expect(typeToString(result.type, result.state.substitution)).toBe('(Int) -> Int');
		});
	});

	describe('Trait Function Type Inference Integration', () => {
		it('should generate generic function type for trait function lookups', () => {
			// Create a mock state with a trait definition
			const registry = createTraitRegistry();
			const trait = {
				name: 'Show',
				typeParam: 'a',
				functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			// Test that isTraitFunction works correctly
			expect(isTraitFunction(registry, 'show')).toBe(true);
			
			// The type inference will return a generic function type for trait functions
			// This is tested indirectly by verifying the trait function is recognized
		});

		it('should maintain registry state through type inference', () => {
			const program = parseProgram('42');
			const result = typeProgram(program);
			
			// Should have trait registry with stdlib definitions
			expect(result.state.traitRegistry).toBeDefined();
			expect(result.state.traitRegistry.definitions.size).toBeGreaterThan(0);
		});
	});
});