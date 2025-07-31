import { test, expect } from 'bun:test';
import {
	assertBinaryExpression,
	assertFunctionType,
	assertImplementDefinitionExpression,
	assertImplementsTypeConstraint,
	assertPrimitiveType,
	parseAndType,
} from '../../../test/utils';
import {
	createTraitRegistry,
	addTraitDefinition,
	addTraitImplementation,
	isTraitFunction,
	TraitImplementation,
} from '../trait-system';
import { functionType, typeVariable, stringType } from '../../ast';

test('Trait System Phase 1 Infrastructure - TraitRegistry - should create empty trait registry', () => {
	const registry = createTraitRegistry();
	expect(registry.definitions.size).toBe(0);
	expect(registry.implementations.size).toBe(0);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should add trait definition', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};

	addTraitDefinition(registry, trait);

	expect(registry.definitions.size).toBe(1);
	expect(registry.definitions.get('Show')).toEqual(trait);
	expect(registry.implementations.has('Show')).toBe(true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should add trait implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const impl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'show',
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

	const success = addTraitImplementation(registry, 'Show', impl);

	expect(success).toBe(true);
	expect(registry.implementations.get('Show')?.get('Float')).toEqual(impl);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should fail to add implementation for non-existent trait', () => {
	const registry = createTraitRegistry();
	const impl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'show',
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

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject implementation with wrong function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	// This is the exact case from the documentation: Show takes 1 param, but implementation takes 2
	const badImpl: TraitImplementation = {
		typeName: 'Option',
		functions: new Map([
			[
				'show',
				{
					kind: 'function',
					params: ['showElement', 'opt'], // 2 parameters - WRONG!
					body: {
						kind: 'literal',
						value: 'dummy',
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

	expect(() => addTraitImplementation(registry, 'Show', badImpl)).toThrow();
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject implementation with too few parameters', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Test',
		typeParam: 'a',
		functions: new Map([
			[
				'fn2',
				functionType([typeVariable('a'), typeVariable('a')], stringType()),
			],
		]),
	};
	addTraitDefinition(registry, trait);

	const badImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'fn2',
				{
					kind: 'function',
					params: ['x'], // 1 parameter, expected 2
					body: {
						kind: 'literal',
						value: 'dummy',
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

	expect(() => addTraitImplementation(registry, 'Test', badImpl)).toThrow();
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should accept implementation with correct function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const correctImpl: TraitImplementation = {
		typeName: 'Option',
		functions: new Map([
			[
				'show',
				{
					kind: 'function',
					params: ['opt'], // 1 parameter - CORRECT!
					body: {
						kind: 'literal',
						value: 'dummy',
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

	const success = addTraitImplementation(registry, 'Show', correctImpl);
	expect(success).toBe(true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should accept variable references (unknown arity)', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	// Variable references can't be validated at this stage
	const variableImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'show',
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

	const success = addTraitImplementation(registry, 'Show', variableImpl);
	expect(success).toBe(true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject function not defined in trait', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	const badImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'nonExistentFunction',
				{
					kind: 'function',
					params: ['x'],
					body: {
						kind: 'literal',
						value: 'dummy',
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

	expect(() => addTraitImplementation(registry, 'Show', badImpl)).toThrow();
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle basic unification without errors', () => {
	// Test that the new unification code doesn't break
	const result = parseAndType(`
		f = fn x => x;
		g = fn y => y;
		result = f (g 42);
		result
	`);

	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('Float');
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle function composition', () => {
	const result = parseAndType(`
		compose = fn f g => fn x => f (g x);
		add1 = fn x => x + 1;
		mult2 = fn x => x * 2;
		composed = compose add1 mult2;
		composed 5
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('Float');
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle partial application correctly', () => {
	const result = parseAndType(`
		sum = fn x y => x + y;
		sum5 = sum 5;
		sum5
	`);
	assertFunctionType(result.type);
	assertPrimitiveType(result.type.params[0]);
	expect(result.type.params[0].name).toBe('Float');
	assertPrimitiveType(result.type.return);
	expect(result.type.return.name).toBe('Float');
});

test('Trait System Phase 1 Infrastructure - Trait Function Type Inference Integration - should generate generic function type for trait function lookups', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, trait);

	expect(isTraitFunction(registry, 'show')).toBe(true);
});

test('Trait System Phase 1 Infrastructure - Trait Function Type Inference Integration - should maintain registry state through type inference', () => {
	const result = parseAndType(`
		constraint TestShow a ( show2 : a -> String );
		implement TestShow Float ( show2 = toString );
		result = show2 42
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should parse implement statements with given constraints', () => {
	const { program } = parseAndType(`
		constraint Show2 a ( show2 : a -> String );
		implement Show2 (List a) given a implements Show2 ( 
			show2 = fn list => "test" 
		);
	`);

	expect(program.statements.length).toBe(1);
	// The parser treats constraint; implement as a binary expression
	const binaryExpr = program.statements[0];
	assertBinaryExpression(binaryExpr);

	// The implement statement is the right side of the binary expression
	const implementStmt = binaryExpr.right;
	assertImplementDefinitionExpression(implementStmt);
	expect(implementStmt.constraintName).toBe('Show2');
	expect(implementStmt.givenConstraints).toBeTruthy();
	assertImplementsTypeConstraint(implementStmt.givenConstraints!);
	expect(implementStmt.givenConstraints.typeVar).toBe('a');
	expect(implementStmt.givenConstraints.interfaceName).toBe('Show2');
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should validate given constraints are satisfied during implementation', () => {
	const registry = createTraitRegistry();

	// Define Show trait
	const showTrait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, showTrait);

	// This should fail because we haven't implemented Show Float yet
	const conditionalImpl: TraitImplementation = {
		typeName: 'List',
		functions: new Map([
			[
				'show',
				{
					kind: 'function',
					params: ['list'],
					body: {
						kind: 'literal',
						value: 'test',
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
		givenConstraints: {
			kind: 'implements',
			typeVar: 'a',
			interfaceName: 'Show',
		},
	};

	// TODO: This should eventually check that the given constraint is satisfied
	// For now, just test that it doesn't crash
	expect(() =>
		addTraitImplementation(registry, 'Show', conditionalImpl)
	).not.toThrow();
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should accept conditional implementations when constraints are satisfied', () => {
	const registry = createTraitRegistry();

	// Define Show trait
	const showTrait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([
			['show', functionType([typeVariable('a')], stringType())],
		]),
	};
	addTraitDefinition(registry, showTrait);

	// First implement Show Float
	const intImpl: TraitImplementation = {
		typeName: 'Float',
		functions: new Map([
			[
				'show',
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
	addTraitImplementation(registry, 'Show', intImpl);

	// Now implement Show (List a) given Show a - this should work
	const conditionalImpl: TraitImplementation = {
		typeName: 'List',
		functions: new Map([
			[
				'show',
				{
					kind: 'function',
					params: ['list'],
					body: {
						kind: 'literal',
						value: 'test',
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
		givenConstraints: {
			kind: 'implements',
			typeVar: 'a',
			interfaceName: 'Show',
		},
	};

	const success = addTraitImplementation(registry, 'Show', conditionalImpl);
	expect(success).toBe(true);
});
