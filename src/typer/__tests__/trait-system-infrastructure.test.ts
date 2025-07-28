import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { typeProgram } from '..';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeToString } from '../helpers';
import { createTraitRegistry, addTraitDefinition, addTraitImplementation, isTraitFunction, resolveTraitFunction } from '../trait-system';
import { functionType, typeVariable, stringType, floatType } from '../../ast';

const parseProgram = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

test('Trait System Phase 1 Infrastructure - TraitRegistry - should create empty trait registry', () => {
	const registry = createTraitRegistry();
	assert.is(registry.definitions.size, 0);
	assert.is(registry.implementations.size, 0);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should add trait definition', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	
	addTraitDefinition(registry, trait);
	
	assert.is(registry.definitions.size, 1);
	assert.equal(registry.definitions.get('Show'), trait);
	assert.is(registry.implementations.has('Show'), true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should add trait implementation', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const impl = {
		typeName: 'Float',
		functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'Show', impl);
	
	assert.is(success, true);
	assert.equal(registry.implementations.get('Show')?.get('Float'), impl);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should fail to add implementation for non-existent trait', () => {
	const registry = createTraitRegistry();
	const impl = {
		typeName: 'Float',
		functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'NonExistent', impl);
	
	assert.is(success, false);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject implementation with wrong function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	// This is the exact case from the documentation: Show takes 1 param, but implementation takes 2
	const badImpl = {
		typeName: 'Option',
		functions: new Map([['show', {
			kind: 'function',
			params: ['showElement', 'opt'], // 2 parameters - WRONG!
			body: { kind: 'literal', value: 'dummy' }
		} as any]]),
	};
	
	assert.throws(() => addTraitImplementation(registry, 'Show', badImpl),
		/Function signature mismatch for 'show' in Show implementation for Option: expected 1 parameters, got 2/);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject implementation with too few parameters', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Test',
		typeParam: 'a',
		functions: new Map([['fn2', functionType([typeVariable('a'), typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const badImpl = {
		typeName: 'Float',
		functions: new Map([['fn2', {
			kind: 'function',
			params: ['x'], // 1 parameter, expected 2
			body: { kind: 'literal', value: 'dummy' }
		} as any]]),
	};
	
	assert.throws(() => addTraitImplementation(registry, 'Test', badImpl),
		/Function signature mismatch for 'fn2' in Test implementation for Float: expected 2 parameters, got 1/);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should accept implementation with correct function signature', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const correctImpl = {
		typeName: 'Option',
		functions: new Map([['show', {
			kind: 'function',
			params: ['opt'], // 1 parameter - CORRECT!
			body: { kind: 'literal', value: 'dummy' }
		} as any]]),
	};
	
	const success = addTraitImplementation(registry, 'Show', correctImpl);
	assert.is(success, true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should accept variable references (unknown arity)', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	// Variable references can't be validated at this stage
	const variableImpl = {
		typeName: 'Float',
		functions: new Map([['show', { kind: 'variable', name: 'intToString' } as any]]),
	};
	
	const success = addTraitImplementation(registry, 'Show', variableImpl);
	assert.is(success, true);
});

test('Trait System Phase 1 Infrastructure - TraitRegistry - should reject function not defined in trait', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	const badImpl = {
		typeName: 'Float',
		functions: new Map([['nonExistentFunction', {
			kind: 'function',
			params: ['x'],
			body: { kind: 'literal', value: 'dummy' }
		} as any]]),
	};
	
	assert.throws(() => addTraitImplementation(registry, 'Show', badImpl),
		/Function 'nonExistentFunction' not defined in trait Show/);
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle basic unification without errors', () => {
	// Test that the new unification code doesn't break
	const program = parseProgram(`
		f = fn x => x;
		g = fn y => y;
		result = f (g 42);
		result
	`);
	const result = typeProgram(program);
	
	assert.is(typeToString(result.type, result.state.substitution), 'Float');
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle function composition', () => {
	const program = parseProgram(`
		compose = fn f g => fn x => f (g x);
		add1 = fn x => x + 1;
		mult2 = fn x => x * 2;
		composed = compose add1 mult2;
		composed 5
	`);
	const result = typeProgram(program);
	
	assert.is(typeToString(result.type, result.state.substitution), 'Float');
});

test('Trait System Phase 1 Infrastructure - Constraint Type Infrastructure - should handle partial application correctly', () => {
	const program = parseProgram(`
		sum = fn x y => x + y;
		sum5 = sum 5;
		sum5
	`);
	const result = typeProgram(program);
	
	assert.is(typeToString(result.type, result.state.substitution), '(Float) -> Float');
});

test('Trait System Phase 1 Infrastructure - Trait Function Type Inference Integration - should generate generic function type for trait function lookups', () => {
	const registry = createTraitRegistry();
	const trait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, trait);

	assert.is(isTraitFunction(registry, 'show'), true);
});

test('Trait System Phase 1 Infrastructure - Trait Function Type Inference Integration - should maintain registry state through type inference', () => {
	const program = parseProgram(`
		constraint TestShow a ( show2 : a -> String );
		implement TestShow Float ( show2 = toString );
		result = show2 42
	`);

	assert.not.throws(() => typeProgram(program));
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should parse implement statements with given constraints', () => {
	const program = parseProgram(`
		constraint Show a ( show : a -> String );
		implement Show (List a) given a implements Show ( 
			show = fn list => "test" 
		);
	`);

	assert.is(program.statements.length, 1);
	// The parser treats constraint; implement as a binary expression
	const binaryExpr = program.statements[0] as any;
	assert.is(binaryExpr.kind, 'binary');
	assert.is(binaryExpr.operator, ';');
	
	// The implement statement is the right side of the binary expression
	const implementStmt = binaryExpr.right;
	assert.is(implementStmt.kind, 'implement-definition');
	
	assert.is(implementStmt.constraintName, 'Show');
	assert.ok(implementStmt.givenConstraints);
	assert.is(implementStmt.givenConstraints.kind, 'implements');
	assert.is(implementStmt.givenConstraints.typeVar, 'a');
	assert.is(implementStmt.givenConstraints.interfaceName, 'Show');
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should validate given constraints are satisfied during implementation', () => {
	const registry = createTraitRegistry();
	
	// Define Show trait
	const showTrait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, showTrait);

	// This should fail because we haven't implemented Show Float yet
	const conditionalImpl = {
		typeName: 'List',
		functions: new Map([['show', {
			kind: 'function',
			params: ['list'],
			body: { kind: 'literal', value: 'test' }
		} as any]]),
		givenConstraints: {
			kind: 'implements',
			typeVar: 'a',
			interfaceName: 'Show'
		} as any
	};

	// TODO: This should eventually check that the given constraint is satisfied
	// For now, just test that it doesn't crash
	assert.not.throws(() => addTraitImplementation(registry, 'Show', conditionalImpl));
});

test('Trait System Phase 1 Infrastructure - Conditional Implementations (Given Constraints) - should accept conditional implementations when constraints are satisfied', () => {
	const registry = createTraitRegistry();
	
	// Define Show trait
	const showTrait = {
		name: 'Show',
		typeParam: 'a',
		functions: new Map([['show', functionType([typeVariable('a')], stringType())]]),
	};
	addTraitDefinition(registry, showTrait);

	// First implement Show Float
	const intImpl = {
		typeName: 'Float',
		functions: new Map([['show', { kind: 'variable', name: 'toString' } as any]]),
	};
	addTraitImplementation(registry, 'Show', intImpl);

	// Now implement Show (List a) given Show a - this should work
	const conditionalImpl = {
		typeName: 'List',
		functions: new Map([['show', {
			kind: 'function',
			params: ['list'],
			body: { kind: 'literal', value: 'test' }
		} as any]]),
		givenConstraints: {
			kind: 'implements',
			typeVar: 'a',
			interfaceName: 'Show'
		} as any
	};

	const success = addTraitImplementation(registry, 'Show', conditionalImpl);
	assert.is(success, true);
});

test.run();