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
import { functionType, typeVariable, stringType, floatType, boolType } from '../../ast';
import { 
import { describe, test, expect } from 'bun:test';
	assertNumberValue, 
	assertListValue, 
	assertConstrainedType, 
	assertPrimitiveType,
	assertVariantType 
} from '../../../test/utils';

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
test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should create empty trait registry', () => {
	const registry = createTraitRegistry();
	expect(registry.definitions.size).toBe(0);
	expect(registry.implementations.size).toBe(0);
	expect(registry.functionTraits.size).toBe(0);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should add trait definition', () => {
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

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should add trait implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const impl = {
		typeName: 'Float',
		functions: new Map([['testShow', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'TestShow', impl);
	expect(success).toBe(true);
	
	const showImpls = registry.implementations.get('TestShow');
	expect(showImpls?.has('Float')).toBe(true);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should fail to add implementation for non-existent trait', () => {
	const registry = createTraitRegistry();
	const impl = {
		typeName: 'Float',
		functions: new Map([['testShow', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'NonExistent', impl);
	expect(success).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should reject implementation with wrong function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const badImpl = {
		typeName: 'Float',
		functions: new Map([['testShow', {
			kind: 'function',
			params: ['a', 'b'], // Wrong arity - expects 1 param, provides 2
			body: { kind: 'variable', name: 'result' },
		} as any]]),
	};

	expect(() => addTraitImplementation(registry, 'TestShow', badImpl).toThrow(), /Function signature mismatch/);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should accept variable references (unknown arity)', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const variableImpl = {
		typeName: 'Float',
		functions: new Map([['testShow', { kind: 'variable', name: 'someFunction' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'TestShow', variableImpl);
	expect(success).toBe(true);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should reject function not defined in trait', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const badImpl = {
		typeName: 'Float',
		functions: new Map([['wrongFunction', { kind: 'variable', name: 'something' } as any]]),
	};

	expect(() => addTraitImplementation(registry, 'TestShow', badImpl).toThrow(), /Function 'wrongFunction' not defined in trait TestShow/);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should identify trait functions', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	expect(isTraitFunction(registry).toBe('testShow'), true);
	expect(isTraitFunction(registry).toBe('nonexistent'), false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should resolve trait function with implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const impl = {
		typeName: 'Float',
		functions: new Map([['testShow', { kind: 'variable', name: 'toString' } as any]]),
	};
	addTraitImplementation(registry, 'TestShow', impl);

	const result = resolveTraitFunction(registry, 'testShow', [floatType()]);
	expect(result.found).toBe(true);
	expect(result.traitName).toBe('TestShow');
	expect(result.typeName).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should fail to resolve trait function without implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const result = resolveTraitFunction(registry, 'testShow', [floatType()]);
	expect(result.found).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should fail to resolve non-trait function', () => {
	const registry = createTraitRegistry();
	const result = resolveTraitFunction(registry, 'nonTraitFunction', [floatType()]);
	expect(result.found).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should handle undefined trait functions gracefully', () => {
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

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should not break existing functionality', () => {
	const code = `
		simpleAdd = fn x y => x + y;
		result = simpleAdd 2 3
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should work with ConstrainedType infrastructure', () => {
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

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should work with existing ADT system', () => {
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

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should maintain polymorphic function types', () => {
	const code = `
		constraint TestMap f ( testMap: (a -> b) -> f a -> f b );
		polymorphic = fn f x => testMap f x
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should be a function type since it's a function definition
	expect(typeResult.type.kind).toBe('function');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Conditional Implementations (Given Constraints) - should parse implement statements with given constraints', () => {
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

// ================================================================
// PHASE 3: CONSTRAINT RESOLUTION TESTS  
// ================================================================
test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for List', () => {
	const code = 'result = map (fn x => x + 1) [1, 2, 3]';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should succeed and return concrete List Float type
	expect(typeResult.type.kind).toBe('list');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toBe('List Float');
	// Should NOT have constraint annotations anymore
	assert.not.match(typeString, /implements|given|α\d+/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for Option', () => {
	const code = 'result = map (fn x => x + 1) (Some 42)';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should succeed and return concrete Option Float type
	expect(typeResult.type.kind).toBe('variant');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toBe('Option Float');
	// Should NOT have constraint annotations anymore
	assert.not.match(typeString, /implements|given|α\d+/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Show constraint for Float', () => {
	const code = 'result = show 42';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed and return String
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('String');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Monad constraint polymorphically', () => {
	const code = 'result = pure 42';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed and return a constrained type
	expect(typeResult.type.kind).toBe('constrained');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toMatch(/implements Monad/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Constraint Resolution Failures - should fail when no trait implementation exists', () => {
	const code = 'result = map (fn x => x + 1) "hello"';
	
	const program = parseProgram(code);
	expect(() => typeProgram(program).toThrow(), /No implementation of Functor for String/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Constraint Resolution Failures - should fail when trying to use non-existent trait', () => {
	const code = 'result = unknownTraitFunction 42';
	
	const program = parseProgram(code);
	expect(() => typeProgram(program).toThrow(), /Undefined variable/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle partial application with constraint preservation', () => {
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
	expect(typeString).toMatch(/-> .* Float/); // Should be a function returning constrained Float
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle nested function applications', () => {
	// This tests multiple constraint resolutions in sequence
	const code = `
		increment = fn x => x + 1;
		double = fn x => x * 2;
		result = map double (map increment [1, 2, 3])
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should succeed and resolve to concrete List Float
	expect(typeResult.type.kind).toBe('list');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toBe('List Float');
	assert.not.match(typeString, /implements|given|α\d+/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle multiple different constraints', () => {
	const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// PARTIAL CONSTRAINT COLLAPSE: Functor constraint gets resolved to List,
	// but Show constraint from within the mapped function is preserved
	expect(typeResult.type.kind).toBe('list');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toMatch(/List String/);
	expect(typeString).toMatch(/implements Show/); // Show constraint preserved
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should not break existing type inference', () => {
	const code = `
		simpleFunction = fn x => x + 1;
		result = simpleFunction 42
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should work normally without constraints
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should work with let polymorphism', () => {
	const code = `
		identity = fn x => x;
		stringResult = identity "hello";
		intResult = identity 42
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed - polymorphic function used with different types
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float'); // Last expression evaluated wins
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should integrate with ADT pattern matching', () => {
	const code = `
		handleOption = fn opt => match opt with (
			Some x => show x;
			None => "nothing"
		);
		result = map handleOption [Some 1, None, Some 2]
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should handle complex integration and resolve to concrete List String
	expect(typeResult.type.kind).toBe('list');
	const typeString = typeToString(typeResult.type);
	expect(typeString).toMatch(/List String/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Error Message Quality - should provide helpful error for missing trait implementation', () => {
	const code = 'result = map (fn x => x + 1) 42'; // Float doesn't implement Functor
	
	const program = parseProgram(code);
	
	try {
		typeProgram(program);
		throw new Error('Expected error for missing trait implementation');
	} catch (error) {
		const message = (error as Error).message;
		expect(message).toMatch(/Functor/);
		expect(message).toMatch(/Float/);
		// Should suggest how to fix it
		expect(message).toMatch(/implement/);
	}
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Error Message Quality - should provide clear error location information', () => {
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

// ================================================================
// SAFETY TESTS: CONFLICTING FUNCTIONS & VALIDATION
// ================================================================
test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should allow multiple traits to define the same function name', () => {
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

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should allow different function names in multiple constraints', () => {
	const code = `
		constraint Printable a ( print: a -> String );
		constraint Renderable a ( render: a -> String );
		implement Printable Float ( print = toString );
		implement Renderable Float ( render = toString )
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed - different function names are fine
	expect(typeResult.type.kind).toBe('unit');
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should detect ambiguous function calls when multiple implementations exist', () => {
	const code = `
		constraint Printable a ( display: a -> String );
		constraint Renderable a ( display: a -> String );
		implement Printable Float ( display = toString );
		implement Renderable Float ( display = toString );
		result = display 42
	`;
	
	const program = parseProgram(code);
	
	expect(() => typeProgram(program).toThrow(), /Ambiguous function call.*multiple implementations.*Printable, Renderable/);
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should detect conflicting function names at implementation level', () => {
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
		typeName: 'Float',
		functions: new Map([['display', { kind: 'variable', name: 'printInt' } as any]]),
	};
	const renderImpl = {
		typeName: 'Float',
		functions: new Map([['display', { kind: 'variable', name: 'renderInt' } as any]]),
	};

	addTraitImplementation(registry, 'Printable', printImpl);
	addTraitImplementation(registry, 'Renderable', renderImpl);

	// Should detect conflict when resolving
	expect(() => resolveTraitFunction(registry, 'display', [floatType().toThrow()]), /Ambiguous function call.*multiple implementations.*Printable, Renderable/);
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should work when same function name exists but for different types', () => {
	const code = `
		constraint Printable a ( display: a -> String );
		constraint Renderable a ( display: a -> String );
		implement Printable Float ( display = toString );
		implement Renderable String ( display = fn s => s );
		intResult = display 42;
		stringResult = display "hello"
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed - same function name but different types
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('String');
});

// ================================================================
// EVALUATION INTEGRATION TESTS
// ================================================================
test('Trait System - Consolidated Tests - Evaluation Integration - should evaluate trait functions with stdlib', () => {
	const code = `map (fn x => x + 1) [1, 2, 3]`;
	
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	// CONSTRAINT COLLAPSE: Should be concrete List Float, not constrained
	expect(typeResult.type.kind).toBe('list');
	if (typeResult.type.kind === 'list') {
		expect(typeResult.type.element.kind).toBe('primitive');
		if (typeResult.type.element.kind === 'primitive') {
			expect(typeResult.type.element.name).toBe('Float');
		}
	}
	
	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values).toEqual([
		{ tag: 'number', value: 2 },
		{ tag: 'number', value: 3 },
		{ tag: 'number', value: 4 }
	]);
});

test('Trait System - Consolidated Tests - Evaluation Integration - should work with custom trait function', () => {
	const code = `
		constraint CustomDouble a ( customDouble: a -> a );
		implement CustomDouble Float ( customDouble = fn x => x * 2 );
		customDouble 21
	`;
	
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(42);
});

test('Trait System - Consolidated Tests - Evaluation Integration - should compare direct list_map vs trait map', () => {
	const code = `map (fn x => x + 10) [1, 2, 3]`;
	
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values).toEqual([
		{ tag: 'number', value: 11 },
		{ tag: 'number', value: 12 },
		{ tag: 'number', value: 13 }
	]);
});

// ================================================================
// UTILITY TESTS
// ================================================================
test('Trait System - Consolidated Tests - Type Name Resolution - should correctly identify type names for resolution', () => {
	expect(getTypeName(floatType())).toBe('Float');
	expect(getTypeName(stringType())).toBe('String');
	expect(getTypeName(boolType())).toBe('Bool');
	expect(getTypeName({ kind: 'list').toBe(element: floatType() }), 'List');
	expect(getTypeName({ kind: 'variant').toBe(name: 'Option', args: [floatType()] }), 'Option');
});

