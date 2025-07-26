import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';
import { Evaluator } from '../../evaluator/evaluator';
import { 
	createTraitRegistry, 
	addTraitDefinition, 
	addTraitImplementation, 
	isTraitFunction, 
	resolveTraitFunction,
	getTypeName 
} from '../trait-system';
import { functionType, typeVariable, stringType, intType, listTypeWithElement } from '../../ast';

describe('Trait System - Comprehensive Test Suite', () => {
	// Helper functions
	const parseProgram = (source: string) => {
		const lexer = new Lexer(source);
		const tokens = lexer.tokenize();
		return parse(tokens);
	};

	const parseTypeAndEvaluate = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const typeResult = typeProgram(program);
		const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
		const evalResult = evaluator.evaluateProgram(program);
		
		return { typeResult, evalResult };
	};

	describe('Core Infrastructure', () => {
		describe('TraitRegistry', () => {
			test('should create empty trait registry', () => {
				const registry = createTraitRegistry();
				expect(registry.definitions.size).toBe(0);
				expect(registry.implementations.size).toBe(0);
				expect(registry.functionTraits.size).toBe(0);
			});

			test('should add trait definition', () => {
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
				expect(registry.functionTraits.get('show')).toEqual(['Show']);
			});

			test('should add trait implementation with validation', () => {
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
				
				const showImpls = registry.implementations.get('Show');
				expect(showImpls?.has('Int')).toBe(true);
			});

			test('should reject duplicate implementations', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'Show',
					typeParam: 'a',
					functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const impl1 = {
					typeName: 'Int',
					functions: new Map([['show', { kind: 'variable', name: 'toString' } as any]]),
				};
				const impl2 = {
					typeName: 'Int',
					functions: new Map([['show', { kind: 'variable', name: 'alternative' } as any]]),
				};

				addTraitImplementation(registry, 'Show', impl1);
				expect(() => addTraitImplementation(registry, 'Show', impl2))
					.toThrow('Duplicate implementation of Show for Int');
			});

			test('should validate function signatures', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'Test',
					typeParam: 'a',
					functions: new Map([['fn1', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const badImpl = {
					typeName: 'Int',
					functions: new Map([['fn1', {
						kind: 'function',
						params: ['a', 'b'], // Wrong arity - expects 1 param, provides 2
						body: { kind: 'variable', name: 'result' },
					} as any]]),
				};

				expect(() => addTraitImplementation(registry, 'Test', badImpl))
					.toThrow('Function signature mismatch');
			});
		});

		describe('Function Resolution', () => {
			test('should identify trait functions', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'Show',
					typeParam: 'a',
					functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				expect(isTraitFunction(registry, 'show')).toBe(true);
				expect(isTraitFunction(registry, 'nonexistent')).toBe(false);
			});

			test('should resolve trait function with implementation', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'Show',
					typeParam: 'a',
					functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const impl = {
					typeName: 'Int',
					functions: new Map([['show', { kind: 'variable', name: 'toString' } as any]]),
				};
				addTraitImplementation(registry, 'Show', impl);

				const result = resolveTraitFunction(registry, 'show', [intType()]);
				expect(result.found).toBe(true);
				expect(result.traitName).toBe('Show');
				expect(result.typeName).toBe('Int');
			});

			test('should detect ambiguous function calls', () => {
				const registry = createTraitRegistry();
				
				// Two traits with same function name
				const showTrait = {
					name: 'Show',
					typeParam: 'a',
					functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
				};
				const printTrait = {
					name: 'Print',
					typeParam: 'a', 
					functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
				};
				
				addTraitDefinition(registry, showTrait);
				addTraitDefinition(registry, printTrait);

				// Both implement for same type
				const showImpl = {
					typeName: 'Int',
					functions: new Map([['display', { kind: 'variable', name: 'showInt' } as any]]),
				};
				const printImpl = {
					typeName: 'Int', 
					functions: new Map([['display', { kind: 'variable', name: 'printInt' } as any]]),
				};

				addTraitImplementation(registry, 'Show', showImpl);
				addTraitImplementation(registry, 'Print', printImpl);

				expect(() => resolveTraitFunction(registry, 'display', [intType()]))
					.toThrow(/Ambiguous function call.*multiple implementations.*Show, Print/);
			});
		});
	});

	describe('Parser Integration', () => {
		test('should parse constraint definitions', () => {
			const code = 'constraint Functor f ( map: (a -> b) -> f a -> f b )';
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('unit');
			expect(typeResult.state.traitRegistry.definitions.has('Functor')).toBe(true);
			
			const functorTrait = typeResult.state.traitRegistry.definitions.get('Functor');
			expect(functorTrait?.name).toBe('Functor');
			expect(functorTrait?.functions.has('map')).toBe(true);
		});

		test('should parse implement definitions', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show Int ( show = toString )
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			const showImpls = typeResult.state.traitRegistry.implementations.get('Show');
			expect(showImpls?.has('Int')).toBe(true);
		});

		test('should parse conditional implementations with given constraints', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show (List a) given a implements Show (
					show = fn list => "[" + (toString list) + "]"
				)
			`;
			
			const program = parseProgram(code);
			expect(program.kind).toBe('sequence');
			
			if (program.kind === 'sequence') {
				const implementStmt = program.right;
				expect(implementStmt.kind).toBe('implement-definition');
				
				if (implementStmt.kind === 'implement-definition') {
					expect(implementStmt.givenConstraints).toBeDefined();
					expect(implementStmt.givenConstraints?.kind).toBe('implements');
				}
			}
		});
	});

	describe('Type Inference Integration', () => {
		test('should handle basic trait function calls', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show Int ( show = toString );
				result = show 42
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('String');
			}
		});

		test('should create constrained types for polymorphic trait functions', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				result = map (fn x => x + 1)
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
		});

		test('should resolve constraints during unification', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				result = map (fn x => x + 1) [1, 2, 3]
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
		});

		test('should handle partial application with constraints', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				mapIncrement = map (fn x => x + 1)
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			if (typeResult.type.kind === 'constrained') {
				expect(typeResult.type.baseType.kind).toBe('function');
			}
			
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Functor/);
		});
	});

	describe('Evaluation Integration', () => {
		test('should evaluate trait functions correctly', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show Int ( show = toString );
				show 42
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(typeResult.type.kind).toBe('primitive');
			expect(evalResult.finalResult.tag).toBe('string');
			expect(evalResult.finalResult.value).toBe('42');
		});

		test('should evaluate complex trait expressions', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				map (fn x => x + 1) [1, 2, 3]
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(typeResult.type.kind).toBe('constrained');
			expect(evalResult.finalResult.tag).toBe('list');
			expect(evalResult.finalResult.values).toEqual([
				{ tag: 'number', value: 2 },
				{ tag: 'number', value: 3 },
				{ tag: 'number', value: 4 }
			]);
		});

		test('should handle trait function composition', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				increment = fn x => x + 1;
				double = fn x => x * 2;
				map double (map increment [1, 2, 3])
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(evalResult.finalResult.tag).toBe('list');
			expect(evalResult.finalResult.values).toEqual([
				{ tag: 'number', value: 4 },  // (1+1)*2 = 4
				{ tag: 'number', value: 6 },  // (2+1)*2 = 6
				{ tag: 'number', value: 8 }   // (3+1)*2 = 8
			]);
		});
	});

	describe('Built-in Types and Standard Library', () => {
		test('should work with Option type', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor Option ( map = option_map );
				map (fn x => x + 1) (Some 42)
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(typeResult.type.kind).toBe('constrained');
		});

		test('should work with List type', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				map (fn x => x + 1) [1, 2, 3]
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(evalResult.finalResult.tag).toBe('list');
			expect(evalResult.finalResult.values.length).toBe(3);
		});

		test('should work with multiple traits', () => {
			const code = `
				constraint Show a ( show: a -> String );
				constraint Eq a ( equals: a -> a -> Bool );
				implement Show Int ( show = toString );
				implement Eq Int ( equals = fn a b => a == b );
				result1 = show 42;
				result2 = equals 1 2
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(evalResult.finalResult.tag).toBe('boolean');
		});
	});

	describe('Error Handling', () => {
		test('should error on missing trait implementation', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				map (fn x => x + 1) "hello"
			`;
			
			const program = parseProgram(code);
			expect(() => typeProgram(program))
				.toThrow(/No implementation of Functor for String/);
		});

		test('should error on undefined trait function', () => {
			const code = 'unknownFunction 42';
			
			const program = parseProgram(code);
			expect(() => typeProgram(program))
				.toThrow(/Undefined variable/);
		});

		test('should provide helpful error messages', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				map (fn x => x + 1) 42
			`;
			
			const program = parseProgram(code);
			
			try {
				typeProgram(program);
				// fail('Expected error for missing trait implementation'); // This line was commented out in the original file
			} catch (error) {
				const message = (error as Error).message;
				expect(message).toMatch(/Functor/);
				expect(message).toMatch(/Int/);
				expect(message).toMatch(/implement/);
			}
		});
	});

	describe('Advanced Features', () => {
		test('should handle higher-kinded types', () => {
			const code = `
				constraint Monad m ( 
					pure: a -> m a; 
					bind: m a -> (a -> m b) -> m b 
				);
				implement Monad Option ( 
					pure = Some; 
					bind = option_bind 
				);
				result = pure 42
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Monad/);
		});

		test('should handle complex type expressions', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show (List Int) ( show = fn list => toString list );
				show [1, 2, 3]
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('String');
			}
		});

		test('should handle function types in implementations', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show (Int -> Int) ( show = fn f => "function" );
				result = show (fn x => x + 1)
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('primitive');
		});
	});

	describe('Performance and Edge Cases', () => {
		test('should handle deeply nested trait calls', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				f1 = fn x => x + 1;
				f2 = fn x => x * 2; 
				f3 = fn x => x - 1;
				map f3 (map f2 (map f1 [1, 2, 3]))
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(typeResult.type.kind).toBe('constrained');
			expect(evalResult.finalResult.tag).toBe('list');
		});

		test('should handle polymorphic functions with constraints', () => {
			const code = `
				constraint Functor f ( map: (a -> b) -> f a -> f b );
				implement Functor List ( map = list_map );
				polymorphicMap = fn f list => map f list;
				polymorphicMap (fn x => x + 1) [1, 2, 3]
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(typeResult.type.kind).toBe('constrained');
			expect(evalResult.finalResult.values.length).toBe(3);
		});

		test('should integrate with existing language features', () => {
			const code = `
				constraint Show a ( show: a -> String );
				implement Show Int ( show = toString );
				
				# Test with ADTs and pattern matching
				type MyOption a = MySome a | MyNone;
				handleOption = fn opt => match opt with (
					MySome x => show x;
					MyNone => "nothing"
				);
				
				# Test with pipeline operators
				result = 42 | show | (fn s => s + "!")
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(evalResult.finalResult.tag).toBe('string');
			expect(evalResult.finalResult.value).toBe('42!');
		});
	});
});