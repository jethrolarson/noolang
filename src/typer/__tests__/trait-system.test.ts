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
import { functionType, typeVariable, stringType, intType, boolType } from '../../ast';

describe('Trait System - Consolidated Tests', () => {
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

	// ================================================================
	// PHASE 1: CORE INFRASTRUCTURE TESTS
	// ================================================================
	describe('Phase 1: Core Infrastructure', () => {
		describe('TraitRegistry Operations', () => {
			test('should create empty trait registry', () => {
				const registry = createTraitRegistry();
				expect(registry.definitions.size).toBe(0);
				expect(registry.implementations.size).toBe(0);
				expect(registry.functionTraits.size).toBe(0);
			});

			test('should add trait definition', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				
				addTraitDefinition(registry, trait);
				
				expect(registry.definitions.size).toBe(1);
				expect(registry.definitions.get('TestShow')).toEqual(trait);
				expect(registry.implementations.has('TestShow')).toBe(true);
			});

			test('should add trait implementation', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const impl = {
					typeName: 'Int',
					functions: new Map([['testShow', { kind: 'variable', name: 'intToString' } as any]]),
				};
				
				const success = addTraitImplementation(registry, 'TestShow', impl);
				expect(success).toBe(true);
				
				const showImpls = registry.implementations.get('TestShow');
				expect(showImpls?.has('Int')).toBe(true);
			});

			test('should fail to add implementation for non-existent trait', () => {
				const registry = createTraitRegistry();
				const impl = {
					typeName: 'Int',
					functions: new Map([['testShow', { kind: 'variable', name: 'intToString' } as any]]),
				};
				
				const success = addTraitImplementation(registry, 'NonExistent', impl);
				expect(success).toBe(false);
			});

			test('should reject implementation with wrong function signature', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const badImpl = {
					typeName: 'Int',
					functions: new Map([['testShow', {
						kind: 'function',
						params: ['a', 'b'], // Wrong arity - expects 1 param, provides 2
						body: { kind: 'variable', name: 'result' },
					} as any]]),
				};

				expect(() => addTraitImplementation(registry, 'TestShow', badImpl))
					.toThrow('Function signature mismatch');
			});

			test('should accept variable references (unknown arity)', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const variableImpl = {
					typeName: 'Int',
					functions: new Map([['testShow', { kind: 'variable', name: 'someFunction' } as any]]),
				};
				
				const success = addTraitImplementation(registry, 'TestShow', variableImpl);
				expect(success).toBe(true);
			});

			test('should reject function not defined in trait', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const badImpl = {
					typeName: 'Int',
					functions: new Map([['wrongFunction', { kind: 'variable', name: 'something' } as any]]),
				};

				expect(() => addTraitImplementation(registry, 'TestShow', badImpl))
					.toThrow("Function 'wrongFunction' not defined in trait TestShow");
			});
		});

		describe('Trait Function Resolution', () => {
			test('should identify trait functions', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				expect(isTraitFunction(registry, 'testShow')).toBe(true);
				expect(isTraitFunction(registry, 'nonexistent')).toBe(false);
			});

			test('should resolve trait function with implementation', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const impl = {
					typeName: 'Int',
					functions: new Map([['testShow', { kind: 'variable', name: 'toString' } as any]]),
				};
				addTraitImplementation(registry, 'TestShow', impl);

				const result = resolveTraitFunction(registry, 'testShow', [intType()]);
				expect(result.found).toBe(true);
				expect(result.traitName).toBe('TestShow');
				expect(result.typeName).toBe('Int');
			});

			test('should fail to resolve trait function without implementation', () => {
				const registry = createTraitRegistry();
				const trait = {
					name: 'TestShow',
					typeParam: 'a',
					functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
				};
				addTraitDefinition(registry, trait);

				const result = resolveTraitFunction(registry, 'testShow', [intType()]);
				expect(result.found).toBe(false);
			});

			test('should fail to resolve non-trait function', () => {
				const registry = createTraitRegistry();
				const result = resolveTraitFunction(registry, 'nonTraitFunction', [intType()]);
				expect(result.found).toBe(false);
			});
		});

		describe('Type System Integration', () => {
			test('should handle undefined trait functions gracefully', () => {
				const code = `
					constraint CustomTrait a ( customFunc: a -> String );
					result = customFunc 42
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should create a constrained type since no implementation exists yet
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/implements CustomTrait/);
			});

			test('should not break existing functionality', () => {
				const code = `
					simpleAdd = fn x y => x + y;
					result = simpleAdd 2 3
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				expect(typeResult.type.kind).toBe('primitive');
				if (typeResult.type.kind === 'primitive') {
					expect(typeResult.type.name).toBe('Int');
				}
			});

			test('should work with ConstrainedType infrastructure', () => {
				const code = `
					constraint TestFunctor f ( testMap: (a -> b) -> f a -> f b );
					result = testMap (fn x => x + 1)
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/implements TestFunctor/);
			});

			test('should work with existing ADT system', () => {
				const code = `
					type CustomOption a = CustomSome a | CustomNone;
					constraint TestShow a ( testShow: a -> String );
					implement TestShow (CustomOption a) ( testShow = fn opt => "custom" );
					test = CustomSome 42
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				expect(typeResult.type.kind).toBe('variant');
			});

			test('should maintain polymorphic function types', () => {
				const code = `
					constraint TestMap f ( testMap: (a -> b) -> f a -> f b );
					polymorphic = fn f x => testMap f x
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should be a function type since it's a function definition
				expect(typeResult.type.kind).toBe('function');
			});
		});

		describe('Conditional Implementations (Given Constraints)', () => {
			test('should parse implement statements with given constraints', () => {
				const code = `
					constraint TestShow a ( testShow: a -> String );
					implement TestShow (List a) given a implements Show (
						testShow = fn list => toString list
					)
				`;
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should successfully parse and type check
				expect(typeResult.type.kind).toBe('unit');
				expect(typeResult.state.traitRegistry.definitions.has('TestShow')).toBe(true);
			});
		});
	});

	// ================================================================
	// PHASE 3: CONSTRAINT RESOLUTION TESTS  
	// ================================================================
	describe('Phase 3: Constraint Resolution', () => {
		describe('Basic Constraint Resolution', () => {
			test('should resolve Functor constraint for List', () => {
				const code = 'result = map (fn x => x + 1) [1, 2, 3]';
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should succeed and return a constrained type
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/implements Functor/);
			});

			test('should resolve Functor constraint for Option', () => {
				const code = 'result = map (fn x => x + 1) (Some 42)';
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should succeed and return a constrained type
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/implements Functor/);
			});

			test('should resolve Show constraint for Int', () => {
				const code = 'result = show 42';
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should succeed and return String
				expect(typeResult.type.kind).toBe('primitive');
				if (typeResult.type.kind === 'primitive') {
					expect(typeResult.type.name).toBe('String');
				}
			});

			test('should resolve Monad constraint polymorphically', () => {
				const code = 'result = pure 42';
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
				expect(() => typeProgram(program)).toThrow(/No implementation of Functor for String/);
			});

			test('should fail when trying to use non-existent trait', () => {
				const code = 'result = unknownTraitFunction 42';
				
				const program = parseProgram(code);
				expect(() => typeProgram(program)).toThrow(/Undefined variable/);
			});
		});

		describe('Complex Constraint Resolution', () => {
			test('should handle partial application with constraint preservation', () => {
				const code = 'mapIncrement = map (fn x => x + 1)';
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
				const typeResult = typeProgram(program);
				
				// Should handle both Functor constraint on map and implicit Show constraint
				expect(typeResult.type.kind).toBe('constrained');
				const typeString = typeToString(typeResult.type);
				expect(typeString).toMatch(/String/);
				expect(typeString).toMatch(/implements Functor/);
			});
		});

		describe('Integration with Existing System', () => {
			test('should not break existing type inference', () => {
				const code = `
					simpleFunction = fn x => x + 1;
					result = simpleFunction 42
				`;
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
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
				
				const program = parseProgram(code);
				
				try {
					typeProgram(program);
					throw new Error('Expected error for missing trait implementation');
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
				
				const program = parseProgram(code);
				
				try {
					typeProgram(program);
					throw new Error('Expected error for missing trait implementation');
				} catch (error) {
					const message = (error as Error).message;
					// Should include location information
					expect(message).toMatch(/line 1/);
				}
			});
		});
	});

	// ================================================================
	// SAFETY TESTS: CONFLICTING FUNCTIONS & VALIDATION
	// ================================================================
	describe('Safety: Conflicting Functions & Validation', () => {
		test('should allow multiple traits to define the same function name', () => {
			const code = `
				constraint Printable a ( display: a -> String );
				constraint Renderable a ( display: a -> String );
				constraint Debuggable a ( debug: a -> String )
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			// Should succeed - multiple traits can define same function names
			expect(typeResult.type.kind).toBe('unit');
			// Note: The registry includes stdlib traits, so we check that our 3 were added
			expect(typeResult.state.traitRegistry.definitions.has('Printable')).toBe(true);
			expect(typeResult.state.traitRegistry.definitions.has('Renderable')).toBe(true);
			expect(typeResult.state.traitRegistry.definitions.has('Debuggable')).toBe(true);
		});

		test('should allow different function names in multiple constraints', () => {
			const code = `
				constraint Printable a ( print: a -> String );
				constraint Renderable a ( render: a -> String );
				implement Printable Int ( print = toString );
				implement Renderable Int ( render = toString )
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			// Should succeed - different function names are fine
			expect(typeResult.type.kind).toBe('unit');
		});

		test('should detect ambiguous function calls when multiple implementations exist', () => {
			const code = `
				constraint Printable a ( display: a -> String );
				constraint Renderable a ( display: a -> String );
				implement Printable Int ( display = toString );
				implement Renderable Int ( display = toString );
				result = display 42
			`;
			
			const program = parseProgram(code);
			
			expect(() => typeProgram(program))
				.toThrow(/Ambiguous function call.*multiple implementations.*Printable, Renderable/);
		});

		test('should detect conflicting function names at implementation level', () => {
			// This is testing that the trait registry properly tracks function conflicts
			const registry = createTraitRegistry();
			
			// Two traits with same function name
			const printable = {
				name: 'Printable',
				typeParam: 'a',
				functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
			};
			const renderable = {
				name: 'Renderable',
				typeParam: 'a',
				functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
			};
			
			addTraitDefinition(registry, printable);
			addTraitDefinition(registry, renderable);

			// Both implement for same type
			const printImpl = {
				typeName: 'Int',
				functions: new Map([['display', { kind: 'variable', name: 'printInt' } as any]]),
			};
			const renderImpl = {
				typeName: 'Int',
				functions: new Map([['display', { kind: 'variable', name: 'renderInt' } as any]]),
			};

			addTraitImplementation(registry, 'Printable', printImpl);
			addTraitImplementation(registry, 'Renderable', renderImpl);

			// Should detect conflict when resolving
			expect(() => resolveTraitFunction(registry, 'display', [intType()]))
				.toThrow(/Ambiguous function call.*multiple implementations.*Printable, Renderable/);
		});

		test('should work when same function name exists but for different types', () => {
			const code = `
				constraint Printable a ( display: a -> String );
				constraint Renderable a ( display: a -> String );
				implement Printable Int ( display = toString );
				implement Renderable String ( display = fn s => s );
				intResult = display 42;
				stringResult = display "hello"
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			// Should succeed - same function name but different types
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('String');
			}
		});
	});

	// ================================================================
	// EVALUATION INTEGRATION TESTS
	// ================================================================
	describe('Evaluation Integration', () => {
		test('should evaluate trait functions with stdlib', () => {
			const code = `map (fn x => x + 1) [1, 2, 3]`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(typeResult.type.kind).toBe('constrained');
			expect(evalResult.finalResult.tag).toBe('list');
			if (evalResult.finalResult.tag === 'list') {
				expect(evalResult.finalResult.values).toEqual([
					{ tag: 'number', value: 2 },
					{ tag: 'number', value: 3 },
					{ tag: 'number', value: 4 }
				]);
			}
		});

		test('should work with custom trait function', () => {
			const code = `
				constraint CustomDouble a ( customDouble: a -> a );
				implement CustomDouble Int ( customDouble = fn x => x * 2 );
				customDouble 21
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(evalResult.finalResult.tag).toBe('number');
			if (evalResult.finalResult.tag === 'number') {
				expect(evalResult.finalResult.value).toBe(42);
			}
		});

		test('should compare direct list_map vs trait map', () => {
			const code = `map (fn x => x + 10) [1, 2, 3]`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(evalResult.finalResult.tag).toBe('list');
			if (evalResult.finalResult.tag === 'list') {
				expect(evalResult.finalResult.values).toEqual([
					{ tag: 'number', value: 11 },
					{ tag: 'number', value: 12 },
					{ tag: 'number', value: 13 }
				]);
			}
		});
	});

	// ================================================================
	// UTILITY TESTS
	// ================================================================
	describe('Type Name Resolution', () => {
		test('should correctly identify type names for resolution', () => {
			expect(getTypeName(intType())).toBe('Int');
			expect(getTypeName(stringType())).toBe('String');
			expect(getTypeName(boolType())).toBe('Bool');
			expect(getTypeName({ kind: 'list', element: intType() })).toBe('List');
			expect(getTypeName({ kind: 'variant', name: 'Option', args: [intType()] })).toBe('Option');
		});
	});
});