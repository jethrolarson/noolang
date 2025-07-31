import {
	createTraitRegistry,
	addTraitDefinition,
	addTraitImplementation,
	isTraitFunction,
	resolveTraitFunction,
	getTypeName,
	TraitImplementation,
	TraitDefinition,
} from '../trait-system';
import {
	functionType,
	typeVariable,
	stringType,
	floatType,
	boolType,
} from '../../ast';
import { test, expect } from 'bun:test';
import {
	assertNumberValue,
	assertListValue,
	assertPrimitiveType,
	parseAndType,
	assertConstrainedType,
	assertVariantType,
	assertFunctionType,
	assertUnitType,
	assertListType,
	runCode,
	assertImplementsTraitConstraint,
} from '../../../test/utils';
import { createNumber } from '../../evaluator/evaluator';
// ================================================================
// PHASE 1: CORE INFRASTRUCTURE TESTS
// ================================================================
test('should create empty trait registry', () => {
	const registry = createTraitRegistry();
	expect(registry.definitions.size).toBe(0);
	expect(registry.implementations.size).toBe(0);
	expect(registry.functionTraits.size).toBe(0);
});

test('should add trait definition', () => {
	const registry = createTraitRegistry();
	const trait: TraitDefinition = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
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
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const impl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'testShow',
				{
					kind: 'variable',
					name: 'intToString',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	const success = addTraitImplementation(registry, 'TestShow', impl);
	expect(success).toBe(true);

	const showImpls = registry.implementations.get('TestShow');
	expect(showImpls?.has('Float')).toBe(true);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should fail to add implementation for non-existent trait', () => {
	const registry = createTraitRegistry();
	const impl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'testShow',
				{
					kind: 'variable',
					name: 'intToString',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	const success = addTraitImplementation(registry, 'NonExistent', impl);
	expect(success).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should reject implementation with wrong function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const badImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'testShow',
				{
					kind: 'function',
					params: ['a', 'b'], // Wrong arity - expects 1 param, provides 2
					body: {
						kind: 'variable',
						name: 'result',
						location: {
							start: { line: 1, column: 1 },
							end: { line: 1, column: 1 },
						},
					},
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	expect(() => addTraitImplementation(registry, 'TestShow', badImpl)).toThrow();
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should accept variable references (unknown arity)', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const variableImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'testShow',
				{
					kind: 'variable',
					name: 'someFunction',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	const success = addTraitImplementation(registry, 'TestShow', variableImpl);
	expect(success).toBe(true);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - TraitRegistry Operations - should reject function not defined in trait', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const badImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'wrongFunction',
				{
					kind: 'variable',
					name: 'something',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	expect(() => addTraitImplementation(registry, 'TestShow', badImpl)).toThrow();
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should identify trait functions', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	expect(isTraitFunction(registry, 'testShow')).toBe(true);
	expect(isTraitFunction(registry, 'nonexistent')).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should resolve trait function with implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'TestShow',
		typeParam: 'a',
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const impl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'testShow',
				{
					kind: 'variable',
					name: 'toString',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
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
		functions: new Map([
			['testShow', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const result = resolveTraitFunction(registry, 'testShow', [floatType()]);
	expect(result.found).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Trait Function Resolution - should fail to resolve non-trait function', () => {
	const registry = createTraitRegistry();
	const result = resolveTraitFunction(registry, 'nonTraitFunction', [
		floatType(),
	]);
	expect(result.found).toBe(false);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should throw when no implementation of trait function exists for the passed type', () => {
	const code = `
			constraint CustomTrait a ( customFunc: a -> String );
			customFunc 42
		`;

	// Should throw a type error because no implementation exists for Float
	expect(() => parseAndType(code)).toThrow(
		'No implementation of trait function'
	);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should not break existing functionality', () => {
	const code = `
		simpleAdd = fn x y => x + y;
		result = simpleAdd 2 3
	`;

	const typeResult = parseAndType(code);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should work with ConstrainedType infrastructure', () => {
	const code = `
		constraint TestFunctor f ( testMap: (a -> b) -> f a -> f b );
		result = testMap (fn x => x + 1)
	`;

	const typeResult = parseAndType(code);
	assertConstrainedType(typeResult.type);
	// The constraint is stored under the type variable, not the trait name
	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	const constraint = constraintEntries[0][1][0];
	expect(constraint.kind).toBe('implements');
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should work with existing ADT system', () => {
	const code = `
		type CustomOption a = CustomSome a | CustomNone;
		constraint TestShow a ( testShow: a -> String );
		implement TestShow (CustomOption a) ( testShow = fn opt => "custom" );
		test = CustomSome 42
	`;

	const typeResult = parseAndType(code);
	assertVariantType(typeResult.type);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Type System Integration - should maintain polymorphic function types', () => {
	const code = `
		constraint TestMap f ( testMap: (a -> b) -> f a -> f b );
		polymorphic = fn f x => testMap f x
	`;

	const typeResult = parseAndType(code);
	assertFunctionType(typeResult.type);
});

test('Trait System - Consolidated Tests - Phase 1: Core Infrastructure - Conditional Implementations (Given Constraints) - should parse implement statements with given constraints', () => {
	const code = `
		constraint TestShow a ( testShow: a -> String );
		implement TestShow (List a) given a implements Show (
			testShow = fn list => toString list
		)
	`;

	const typeResult = parseAndType(code);
	// Implement statements return unit, not constrained types
	expect(typeResult.type.kind).toBe('unit');
});

// ================================================================
// PHASE 3: CONSTRAINT RESOLUTION TESTS
// ================================================================
test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for List', () => {
	const code = 'result = map (fn x => x + 1) [1, 2, 3]';

	const typeResult = parseAndType(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Functor constraint for Option', () => {
	const code = 'result = map (fn x => x + 1) (Some 42)';

	const typeResult = parseAndType(code);
	assertVariantType(typeResult.type);
	expect(typeResult.type.name).toBe('Option');
	assertPrimitiveType(typeResult.type.args[0]);
	expect(typeResult.type.args[0].name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Show constraint for Float', () => {
	const code = 'result = show 42';

	const typeResult = parseAndType(code);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('String');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Basic Constraint Resolution - should resolve Monad constraint polymorphically', () => {
	const code = 'pure 42';

	const typeResult = parseAndType(code);
	assertConstrainedType(typeResult.type);
	expect(typeResult.type.constraints.size).toBe(1);
	const constraint = Array.from(typeResult.type.constraints.values())[0][0];
	assertImplementsTraitConstraint(constraint);
	expect(constraint.trait).toBe('Monad');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Constraint Resolution Failures - should fail when no trait implementation exists', () => {
	const code = 'result = map (fn x => x + 1) "hello"';

	expect(() => parseAndType(code)).toThrow();
});

test.skip('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle partial application with constraint preservation', () => {
	const code = 'mapIncrement = map (fn x => x + 1)';

	const typeResult = parseAndType(code);
	assertConstrainedType(typeResult.type);
	const constraint = Array.from(typeResult.type.constraints.values())[0][0];
	assertImplementsTraitConstraint(constraint);
	expect(constraint.trait).toBe('Functor');
	assertFunctionType(typeResult.type.baseType);
	assertPrimitiveType(typeResult.type.baseType.return);
	expect(typeResult.type.baseType.return.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle nested function applications', () => {
	// This tests multiple constraint resolutions in sequence
	const code = `
		increment = fn x => x + 1;
		double = fn x => x * 2;
		result = map double (map increment [1, 2, 3])
	`;

	const typeResult = parseAndType(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle multiple different constraints', () => {
	const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;

	const typeResult = parseAndType(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('String');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should not break existing type inference', () => {
	const code = `
		simpleFunction = fn x => x + 1;
		result = simpleFunction 42
	`;

	const typeResult = parseAndType(code);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float');
});

test('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should work with let polymorphism', () => {
	const code = `
		identity = fn x => x;
		stringResult = identity "hello";
		intResult = identity 42
	`;

	const typeResult = parseAndType(code);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('Float');
});

test.skip('Trait System - Consolidated Tests - Phase 3: Constraint Resolution - Integration with Existing System - should integrate with ADT pattern matching', () => {
	const code = `
		handleOption = fn opt => match opt with (
			Some x => show x;
			None => "nothing"
		);
		result = map handleOption [Some 1, None, Some 2]
	`;

	const typeResult = parseAndType(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('String');
});

test('should provide helpful error for missing trait implementation', () => {
	expect(() => {
		parseAndType('result = map (fn x => x + 1) 42');
	}).toThrow(/Functor.*Float.*implement/i);
});

test('should provide clear error location information', () => {
	expect(() => {
		parseAndType('result = map (fn x => x + 1) "hello"');
	}).toThrow(/line 1/);
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

	const typeResult = parseAndType(code);
	assertUnitType(typeResult.type);

	// Note: The registry includes stdlib traits, so we check that our 3 were added
	expect(typeResult.state.traitRegistry.definitions.has('Printable')).toBe(
		true
	);
	expect(typeResult.state.traitRegistry.definitions.has('Renderable')).toBe(
		true
	);
	expect(typeResult.state.traitRegistry.definitions.has('Debuggable')).toBe(
		true
	);
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should allow different function names in multiple constraints', () => {
	const code = `
		constraint Printable a ( print: a -> String );
		constraint Renderable a ( render: a -> String );
		implement Printable Float ( print = toString );
		implement Renderable Float ( render = toString )
	`;

	const typeResult = parseAndType(code);
	assertUnitType(typeResult.type);
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should detect ambiguous function calls when multiple implementations exist', () => {
	const code = `
		constraint Printable a ( display: a -> String );
		constraint Renderable a ( display: a -> String );
		implement Printable Float ( display = toString );
		implement Renderable Float ( display = toString );
		result = display 42
	`;

	expect(() => parseAndType(code)).toThrow();
});

test('Trait System - Consolidated Tests - Safety: Conflicting Functions & Validation - should detect conflicting function names at implementation level', () => {
	// This is testing that the trait registry properly tracks function conflicts
	const registry = createTraitRegistry();

	// Two traits with same function name
	const printable = {
		name: 'Printable',
		typeParam: 'a',
		functions: new Map([
			['display', functionType([typeVariable('a')], stringType())],
		]),
	};
	const renderable = {
		name: 'Renderable',
		typeParam: 'a',
		functions: new Map([
			['display', functionType([typeVariable('a')], stringType())],
		]),
	};

	addTraitDefinition(registry, printable);
	addTraitDefinition(registry, renderable);

	// Both implement for same type
	const printImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'display',
				{
					kind: 'variable',
					name: 'printInt',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};
	const renderImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'display',
				{
					kind: 'variable',
					name: 'renderInt',
					location: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				},
			],
		]),
	};

	addTraitImplementation(registry, 'Printable', printImpl);
	addTraitImplementation(registry, 'Renderable', renderImpl);

	// Should detect conflict when resolving
	expect(() =>
		resolveTraitFunction(registry, 'display', [floatType()])
	).toThrow();
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

	const typeResult = parseAndType(code);
	assertPrimitiveType(typeResult.type);
	expect(typeResult.type.name).toBe('String');
});

// ================================================================
// EVALUATION INTEGRATION TESTS
// ================================================================
test('Trait System - Consolidated Tests - Evaluation Integration - should evaluate trait functions with stdlib', () => {
	const code = `map (fn x => x + 1) [1, 2, 3]`;

	const { typeResult, evalResult } = runCode(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('Float');

	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values).toEqual([
		createNumber(2),
		createNumber(3),
		createNumber(4),
	]);
});

test('Trait System - Consolidated Tests - Evaluation Integration - should work with custom trait function', () => {
	const code = `
		constraint CustomDouble a ( customDouble: a -> a );
		implement CustomDouble Float ( customDouble = fn x => x * 2 );
		customDouble 21
	`;

	const { evalResult } = runCode(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(42);
});

test('Trait System - Consolidated Tests - Evaluation Integration - should compare direct list_map vs trait map', () => {
	const code = `map (fn x => x + 10) [1, 2, 3]`;

	const { evalResult } = runCode(code);

	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values).toEqual([
		createNumber(11),
		createNumber(12),
		createNumber(13),
	]);
});

// ================================================================
// UTILITY TESTS
// ================================================================
test('Trait System - Consolidated Tests - Type Name Resolution - should correctly identify type names for resolution', () => {
	expect(getTypeName(floatType())).toBe('Float');
	expect(getTypeName(stringType())).toBe('String');
	expect(getTypeName(boolType())).toBe('Bool');
	expect(getTypeName({ kind: 'list', element: floatType() })).toBe('List');
	expect(
		getTypeName({ kind: 'variant', name: 'Option', args: [floatType()] })
	).toBe('Option');
});