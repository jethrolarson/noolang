import { test } from 'uvu';
import * as assert from 'uvu/assert';
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
	assert.is(registry.definitions.size, 0);
	assert.is(registry.implementations.size, 0);
	assert.is(registry.functionTraits.size, 0);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should add trait definition', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	
	addTraitDefinition(registry, trait);
	
	assert.is(registry.definitions.size, 1);
	assert.equal(registry.definitions.get('TestShow'), trait);
	assert.is(registry.implementations.has('TestShow'), true);
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
	assert.is(success, true);
	
	const showImpls = registry.implementations.get('TestShow');
	assert.is(showImpls?.has('Float'), true);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should fail to add implementation for non-existent trait', () => {
	const registry = createTraitRegistry();
	const impl = {
		typeName: 'Float',
		functions: new Map([['testShow', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'NonExistent', impl);
	assert.is(success, false);
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

	assert.throws(() => addTraitImplementation(registry, 'TestShow', badImpl), /Function signature mismatch/);
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
	assert.is(success, true);
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

	assert.throws(() => addTraitImplementation(registry, 'TestShow', badImpl), /Function 'wrongFunction' not defined in trait TestShow/);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should identify trait functions', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([['testShow', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	assert.is(isTraitFunction(registry, 'testShow'), true);
	assert.is(isTraitFunction(registry, 'nonexistent'), false);
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
	assert.is(result.found, true);
	assert.is(result.traitName, 'TestShow');
	assert.is(result.typeName, 'Float');
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
	assert.is(result.found, false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should fail to resolve non-trait function', () => {
	const registry = createTraitRegistry();
	const result = resolveTraitFunction(registry, 'nonTraitFunction', [floatType()]);
	assert.is(result.found, false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should handle undefined trait functions gracefully', () => {
	const code = `
		constraint CustomTrait a ( customFunc: a -> String );
		result = customFunc 42
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should create a constrained type since no implementation exists yet
	assert.is(typeResult.type.kind, 'constrained');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /implements CustomTrait/);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should not break existing functionality', () => {
	const code = `
		simpleAdd = fn x y => x + y;
		result = simpleAdd 2 3
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	assert.is(typeResult.type.kind, 'primitive');
	assert.is(typeResult.type.name, 'Float');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should work with ConstrainedType infrastructure', () => {
	const code = `
		constraint TestFunctor f ( testMap: (a -> b) -> f a -> f b );
		result = testMap (fn x => x + 1)
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	assert.is(typeResult.type.kind, 'constrained');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /implements TestFunctor/);
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
	
	assert.is(typeResult.type.kind, 'variant');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should maintain polymorphic function types', () => {
	const code = `
		constraint TestMap f ( testMap: (a -> b) -> f a -> f b );
		polymorphic = fn f x => testMap f x
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should be a function type since it's a function definition
	assert.is(typeResult.type.kind, 'function');
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
	assert.is(typeResult.type.kind, 'unit');
	assert.is(typeResult.state.traitRegistry.definitions.has('TestShow'), true);
});

// ================================================================
// PHASE 3: CONSTRAINT RESOLUTION TESTS  
// ================================================================
test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for List', () => {
	const code = 'result = map (fn x => x + 1) [1, 2, 3]';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should succeed and return concrete List Float type
	assert.is(typeResult.type.kind, 'list');
	const typeString = typeToString(typeResult.type);
	assert.is(typeString, 'List Float');
	// Should NOT have constraint annotations anymore
	assert.not.match(typeString, /implements|given|α\d+/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for Option', () => {
	const code = 'result = map (fn x => x + 1) (Some 42)';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// CONSTRAINT COLLAPSE: Should succeed and return concrete Option Float type
	assert.is(typeResult.type.kind, 'variant');
	const typeString = typeToString(typeResult.type);
	assert.is(typeString, 'Option Float');
	// Should NOT have constraint annotations anymore
	assert.not.match(typeString, /implements|given|α\d+/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Show constraint for Float', () => {
	const code = 'result = show 42';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed and return String
	assert.is(typeResult.type.kind, 'primitive');
	assert.is(typeResult.type.name, 'String');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Monad constraint polymorphically', () => {
	const code = 'result = pure 42';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should succeed and return a constrained type
	assert.is(typeResult.type.kind, 'constrained');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /implements Monad/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Constraint Resolution Failures - should fail when no trait implementation exists', () => {
	const code = 'result = map (fn x => x + 1) "hello"';
	
	const program = parseProgram(code);
	assert.throws(() => typeProgram(program), /No implementation of Functor for String/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Constraint Resolution Failures - should fail when trying to use non-existent trait', () => {
	const code = 'result = unknownTraitFunction 42';
	
	const program = parseProgram(code);
	assert.throws(() => typeProgram(program), /Undefined variable/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle partial application with constraint preservation', () => {
	const code = 'mapIncrement = map (fn x => x + 1)';
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should return a function type with constraints
	assert.is(typeResult.type.kind, 'constrained');
	if (typeResult.type.kind === 'constrained') {
		assert.is(typeResult.type.baseType.kind, 'function');
	}
	
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /implements Functor/);
	assert.match(typeString, /-> .* Float/); // Should be a function returning constrained Float
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
	assert.is(typeResult.type.kind, 'list');
	const typeString = typeToString(typeResult.type);
	assert.is(typeString, 'List Float');
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
	assert.is(typeResult.type.kind, 'list');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /List String/);
	assert.match(typeString, /implements Show/); // Show constraint preserved
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should not break existing type inference', () => {
	const code = `
		simpleFunction = fn x => x + 1;
		result = simpleFunction 42
	`;
	
	const program = parseProgram(code);
	const typeResult = typeProgram(program);
	
	// Should work normally without constraints
	assert.is(typeResult.type.kind, 'primitive');
	assert.is(typeResult.type.name, 'Float');
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
	assert.is(typeResult.type.kind, 'primitive');
	assert.is(typeResult.type.name, 'Float'); // Last expression evaluated wins
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
	assert.is(typeResult.type.kind, 'list');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /List String/);
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Error Message Quality - should provide helpful error for missing trait implementation', () => {
	const code = 'result = map (fn x => x + 1) 42'; // Float doesn't implement Functor
	
	const program = parseProgram(code);
	
	try {
		typeProgram(program);
		assert.fail('Expected error for missing trait implementation');
	} catch (error) {
		const message = (error as Error).message;
		assert.match(message, /Functor/);
		assert.match(message, /Float/);
		// Should suggest how to fix it
		assert.match(message, /implement/);
	}
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Error Message Quality - should provide clear error location information', () => {
	const code = 'result = map (fn x => x + 1) "hello"';
	
	const program = parseProgram(code);
	
	try {
		typeProgram(program);
		assert.fail('Expected error for missing trait implementation');
	} catch (error) {
		const message = (error as Error).message;
		// Should include location information
		assert.match(message, /line 1/);
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
	assert.is(typeResult.type.kind, 'unit');
	// Note: The registry includes stdlib traits, so we check that our 3 were added
	assert.is(typeResult.state.traitRegistry.definitions.has('Printable'), true);
	assert.is(typeResult.state.traitRegistry.definitions.has('Renderable'), true);
	assert.is(typeResult.state.traitRegistry.definitions.has('Debuggable'), true);
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
	assert.is(typeResult.type.kind, 'unit');
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
	
	assert.throws(() => typeProgram(program), /Ambiguous function call.*multiple implementations.*Printable, Renderable/);
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
	assert.throws(() => resolveTraitFunction(registry, 'display', [floatType()]), /Ambiguous function call.*multiple implementations.*Printable, Renderable/);
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
	assert.is(typeResult.type.kind, 'primitive');
	assert.is(typeResult.type.name, 'String');
});

// ================================================================
// EVALUATION INTEGRATION TESTS
// ================================================================
test('Trait System - Consolidated Tests - Evaluation Integration - should evaluate trait functions with stdlib', () => {
	const code = `map (fn x => x + 1) [1, 2, 3]`;
	
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	// CONSTRAINT COLLAPSE: Should be concrete List Float, not constrained
	assert.is(typeResult.type.kind, 'list');
	if (typeResult.type.kind === 'list') {
		assert.is(typeResult.type.element.kind, 'primitive');
		if (typeResult.type.element.kind === 'primitive') {
			assert.is(typeResult.type.element.name, 'Float');
		}
	}
	
	assert.is(evalResult.finalResult.tag, 'list');
	assert.equal(evalResult.finalResult.values, [
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
	
	assert.is(evalResult.finalResult.tag, 'number');
	assert.is(evalResult.finalResult.value, 42);
});

test('Trait System - Consolidated Tests - Evaluation Integration - should compare direct list_map vs trait map', () => {
	const code = `map (fn x => x + 10) [1, 2, 3]`;
	
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'list');
	assert.equal(evalResult.finalResult.values, [
		{ tag: 'number', value: 11 },
		{ tag: 'number', value: 12 },
		{ tag: 'number', value: 13 }
	]);
});

// ================================================================
// UTILITY TESTS
// ================================================================
test('Trait System - Consolidated Tests - Type Name Resolution - should correctly identify type names for resolution', () => {
	assert.is(getTypeName(floatType()), 'Float');
	assert.is(getTypeName(stringType()), 'String');
	assert.is(getTypeName(boolType()), 'Bool');
	assert.is(getTypeName({ kind: 'list', element: floatType() }), 'List');
	assert.is(getTypeName({ kind: 'variant', name: 'Option', args: [floatType()] }), 'Option');
});

test.run();