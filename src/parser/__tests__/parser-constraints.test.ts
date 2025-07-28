import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { ConstraintDefinitionExpression, ImplementDefinitionExpression } from '../../ast';

// Helper functions for type-safe testing
function assertConstraintDefinitionExpression(expr: any): ConstraintDefinitionExpression {
	if (expr.kind !== 'constraint-definition') {
		throw new Error(`Expected constraint definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertImplementDefinitionExpression(expr: any): ImplementDefinitionExpression {
	if (expr.kind !== 'implement-definition') {
		throw new Error(`Expected implement definition expression, got ${expr.kind}`);
	}
	return expr;
}

test('Constraint Definitions and Implementations - should parse constraint definition', () => {
	const lexer = new Lexer('constraint Show a ( show : a -> String )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	assert.is(constraintDef.name, 'Show');
	assert.equal(constraintDef.typeParams, ['a']);
	assert.is(constraintDef.functions.length, 1);
	assert.is(constraintDef.functions[0].name, 'show');
});

test('Constraint Definitions and Implementations - should parse implement definition', () => {
	const lexer = new Lexer(
		'implement Monad Option ( return = Some; bind = fn opt f => match opt with ( Some x => f x; None => None ) )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const implDef = assertImplementDefinitionExpression(program.statements[0]);
	assert.is(implDef.constraintName, 'Monad');
	assert.is(implDef.typeExpr.kind, 'variant');
	assert.is((implDef.typeExpr as any).name, 'Option');
	assert.is(implDef.implementations.length, 2);
	assert.is(implDef.implementations[0].name, 'return');
	assert.is(implDef.implementations[1].name, 'bind');
});

test('Constraint Definitions and Implementations - should parse constraint with simple functions', () => {
	const lexer = new Lexer('constraint Eq a ( eq a : a -> a -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	assert.is(constraintDef.name, 'Eq');
	assert.equal(constraintDef.typeParams, ['a']);
	assert.is(constraintDef.functions.length, 1);
	assert.is(constraintDef.functions[0].name, 'eq');
	assert.equal(constraintDef.functions[0].typeParams, ['a']);
});

test('Constraint Definitions and Implementations - should parse constraint definition with multiple type parameters', () => {
	const lexer = new Lexer('constraint Eq a b ( eq : a -> b -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	assert.is(program.statements.length, 1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	assert.is(constraintDef.name, 'Eq');
	assert.equal(constraintDef.typeParams, ['a', 'b']);
	assert.is(constraintDef.functions.length, 1);
	assert.is(constraintDef.functions[0].name, 'eq');
});

test.run();