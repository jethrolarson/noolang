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

describe('Trait System - Core Functionality', () => {
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

	describe('TraitRegistry Operations', () => {
		test('should create empty trait registry', () => {
			const registry = createTraitRegistry();
			expect(registry.definitions.size).toBe(0);
			expect(registry.implementations.size).toBe(0);
			expect(registry.functionTraits.size).toBe(0);
		});

		test('should add trait definition and track function names', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Testable',
				typeParam: 'a',
				functions: new Map([
					['test', functionType([typeVariable('a')], boolType())],
					['verify', functionType([typeVariable('a')], stringType())]
				]),
			};
			
			addTraitDefinition(registry, trait);
			
			expect(registry.definitions.size).toBe(1);
			expect(registry.definitions.get('Testable')).toEqual(trait);
			expect(registry.implementations.has('Testable')).toBe(true);
			expect(registry.functionTraits.get('test')).toEqual(['Testable']);
			expect(registry.functionTraits.get('verify')).toEqual(['Testable']);
		});

		test('should add trait implementation with validation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Testable',
				typeParam: 'a',
				functions: new Map([['test', functionType([typeVariable('a')], boolType())]]),
			};
			addTraitDefinition(registry, trait);

			const impl = {
				typeName: 'Int',
				functions: new Map([['test', { kind: 'variable', name: 'isPositive' } as any]]),
			};
			
			const success = addTraitImplementation(registry, 'Testable', impl);
			expect(success).toBe(true);
			
			const testImpls = registry.implementations.get('Testable');
			expect(testImpls?.has('Int')).toBe(true);
		});

		test('should reject duplicate implementations', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Testable',
				typeParam: 'a',
				functions: new Map([['test', functionType([typeVariable('a')], boolType())]]),
			};
			addTraitDefinition(registry, trait);

			const impl1 = {
				typeName: 'Int',
				functions: new Map([['test', { kind: 'variable', name: 'first' } as any]]),
			};
			const impl2 = {
				typeName: 'Int',
				functions: new Map([['test', { kind: 'variable', name: 'second' } as any]]),
			};

			addTraitImplementation(registry, 'Testable', impl1);
			expect(() => addTraitImplementation(registry, 'Testable', impl2))
				.toThrow('Duplicate implementation of Testable for Int');
		});

		test('should validate function signatures', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Calculator',
				typeParam: 'a',
				functions: new Map([['compute', functionType([typeVariable('a')], intType())]]),
			};
			addTraitDefinition(registry, trait);

			const badImpl = {
				typeName: 'String',
				functions: new Map([['compute', {
					kind: 'function',
					params: ['a', 'b'], // Wrong arity - expects 1 param, provides 2
					body: { kind: 'literal', value: 42 },
				} as any]]),
			};

			expect(() => addTraitImplementation(registry, 'Calculator', badImpl))
				.toThrow('Function signature mismatch');
		});

		test('should reject implementation for undefined function', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Testable',
				typeParam: 'a',
				functions: new Map([['test', functionType([typeVariable('a')], boolType())]]),
			};
			addTraitDefinition(registry, trait);

			const badImpl = {
				typeName: 'Int',
				functions: new Map([['wrongFunction', { kind: 'variable', name: 'something' } as any]]),
			};

			expect(() => addTraitImplementation(registry, 'Testable', badImpl))
				.toThrow("Function 'wrongFunction' not defined in trait Testable");
		});
	});

	describe('Function Resolution', () => {
		test('should identify trait functions', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Debuggable',
				typeParam: 'a',
				functions: new Map([['debug', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			expect(isTraitFunction(registry, 'debug')).toBe(true);
			expect(isTraitFunction(registry, 'nonexistent')).toBe(false);
		});

		test('should resolve trait function with implementation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Debuggable',
				typeParam: 'a',
				functions: new Map([['debug', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			const impl = {
				typeName: 'Int',
				functions: new Map([['debug', { kind: 'variable', name: 'debugInt' } as any]]),
			};
			addTraitImplementation(registry, 'Debuggable', impl);

			const result = resolveTraitFunction(registry, 'debug', [intType()]);
			expect(result.found).toBe(true);
			expect(result.traitName).toBe('Debuggable');
			expect(result.typeName).toBe('Int');
		});

		test('should detect ambiguous function calls', () => {
			const registry = createTraitRegistry();
			
			// Two traits with same function name
			const trait1 = {
				name: 'Printer',
				typeParam: 'a',
				functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
			};
			const trait2 = {
				name: 'Renderer',
				typeParam: 'a', 
				functions: new Map([['display', functionType([typeVariable('a')], stringType())]]),
			};
			
			addTraitDefinition(registry, trait1);
			addTraitDefinition(registry, trait2);

			// Both implement for same type
			const impl1 = {
				typeName: 'Int',
				functions: new Map([['display', { kind: 'variable', name: 'printInt' } as any]]),
			};
			const impl2 = {
				typeName: 'Int', 
				functions: new Map([['display', { kind: 'variable', name: 'renderInt' } as any]]),
			};

			addTraitImplementation(registry, 'Printer', impl1);
			addTraitImplementation(registry, 'Renderer', impl2);

			expect(() => resolveTraitFunction(registry, 'display', [intType()]))
				.toThrow(/Ambiguous function call.*multiple implementations.*Printer, Renderer/);
		});

		test('should return not found for missing implementation', () => {
			const registry = createTraitRegistry();
			const trait = {
				name: 'Debuggable',
				typeParam: 'a',
				functions: new Map([['debug', functionType([typeVariable('a')], stringType())]]),
			};
			addTraitDefinition(registry, trait);

			// No implementation for String type
			const result = resolveTraitFunction(registry, 'debug', [stringType()]);
			expect(result.found).toBe(false);
		});
	});

	describe('Parser Integration', () => {
		test('should parse custom constraint definitions', () => {
			const code = 'constraint Serializable a ( serialize: a -> String; deserialize: String -> a )';
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('unit');
			expect(typeResult.state.traitRegistry.definitions.has('Serializable')).toBe(true);
			
			const trait = typeResult.state.traitRegistry.definitions.get('Serializable');
			expect(trait?.name).toBe('Serializable');
			expect(trait?.functions.has('serialize')).toBe(true);
			expect(trait?.functions.has('deserialize')).toBe(true);
		});

		test('should parse custom implement definitions', () => {
			const code = `
				constraint Convertible a ( convert: a -> String );
				implement Convertible Int ( convert = toString )
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			const impls = typeResult.state.traitRegistry.implementations.get('Convertible');
			expect(impls?.has('Int')).toBe(true);
		});

		test('should parse conditional implementations with given constraints', () => {
			const code = `
				constraint Printable a ( print: a -> String );
				implement Printable (List a) given a implements Show (
					print = fn list => toString list
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
					expect(implementStmt.givenConstraints?.typeVar).toBe('a');
					expect(implementStmt.givenConstraints?.interfaceName).toBe('Show');
				}
			}
		});
	});

	describe('Type Inference Integration', () => {
		test('should handle custom trait function calls', () => {
			const code = `
				constraint Validator a ( validate: a -> Bool );
				implement Validator Int ( validate = fn x => x > 0 );
				result = validate 42
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('primitive');
			if (typeResult.type.kind === 'primitive') {
				expect(typeResult.type.name).toBe('Bool');
			}
		});

		test('should create constrained types for polymorphic trait functions', () => {
			const code = `
				constraint MyFunctor f ( myMap: (a -> b) -> f a -> f b );
				result = myMap (fn x => x + 1)
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements MyFunctor/);
		});

		test('should handle partial application with constraints', () => {
			const code = `
				constraint Transformer f ( transform: (a -> b) -> f a -> f b );
				mapAdd = transform (fn x => x + 1)
			`;
			
			const program = parseProgram(code);
			const typeResult = typeProgram(program);
			
			expect(typeResult.type.kind).toBe('constrained');
			if (typeResult.type.kind === 'constrained') {
				expect(typeResult.type.baseType.kind).toBe('function');
			}
			
			const typeString = typeToString(typeResult.type);
			expect(typeString).toMatch(/implements Transformer/);
		});
	});

	describe('Evaluation Integration', () => {
		test('should evaluate custom trait functions correctly', () => {
			const code = `
				constraint Doubler a ( double: a -> a );
				implement Doubler Int ( double = fn x => x * 2 );
				double 21
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(typeResult.type.kind).toBe('primitive');
			expect(evalResult.finalResult.tag).toBe('number');
			expect(evalResult.finalResult.value).toBe(42);
		});

		test('should work with existing stdlib without conflicts', () => {
			// Test that we can use stdlib traits alongside custom ones
			const code = `
				constraint Custom a ( custom: a -> String );
				implement Custom Int ( custom = fn x => "custom: " + (show x) );
				custom 42
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			
			expect(evalResult.finalResult.tag).toBe('string');
			expect(evalResult.finalResult.value).toBe('custom: 42');
		});
	});

	describe('Error Handling', () => {
		test('should error on missing trait implementation', () => {
			const code = `
				constraint MyValidator f ( validate: f a -> Bool );
				validate "hello"
			`;
			
			const program = parseProgram(code);
			expect(() => typeProgram(program))
				.toThrow(/No implementation of MyValidator for String/);
		});

		test('should error on undefined trait function', () => {
			const code = 'undefinedTraitFunction 42';
			
			const program = parseProgram(code);
			expect(() => typeProgram(program))
				.toThrow(/Undefined variable/);
		});

		test('should provide helpful error messages', () => {
			const code = `
				constraint Processor f ( process: (a -> b) -> f a -> f b );
				process (fn x => x + 1) "hello"
			`;
			
			const program = parseProgram(code);
			
			try {
				typeProgram(program);
				expect.fail('Expected error for missing trait implementation');
			} catch (error) {
				const message = (error as Error).message;
				expect(message).toMatch(/Processor/);
				expect(message).toMatch(/String/);
				expect(message).toMatch(/implement/);
			}
		});
	});

	describe('Integration with Language Features', () => {
		test('should work with ADTs and pattern matching', () => {
			const code = `
				constraint Extractable a ( extract: a -> Int );
				type MyData = Value Int | Empty;
				implement Extractable MyData ( 
					extract = fn data => match data with (
						Value x => x;
						Empty => 0
					)
				);
				extract (Value 42)
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(evalResult.finalResult.tag).toBe('number');
			expect(evalResult.finalResult.value).toBe(42);
		});

		test('should work with pipeline operators', () => {
			const code = `
				constraint Incrementer a ( inc: a -> a );
				implement Incrementer Int ( inc = fn x => x + 1 );
				result = 41 | inc
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(evalResult.finalResult.tag).toBe('number');
			expect(evalResult.finalResult.value).toBe(42);
		});

		test('should not interfere with existing type inference', () => {
			const code = `
				# Regular function should still work normally
				add = fn x y => x + y;
				
				# Custom trait should also work
				constraint Multiplier a ( mult: a -> a -> a );
				implement Multiplier Int ( mult = fn x y => x * y );
				
				# Both should work together
				addResult = add 1 2;
				multResult = mult 3 4
			`;
			
			const { typeResult, evalResult } = parseTypeAndEvaluate(code);
			expect(evalResult.finalResult.tag).toBe('number');
			expect(evalResult.finalResult.value).toBe(12); // mult 3 4
		});
	});

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