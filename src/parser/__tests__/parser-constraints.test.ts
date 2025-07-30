import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { ConstraintDefinitionExpression, ImplementDefinitionExpression } from '../../ast';
import { describe, test, expect } from 'bun:test';

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
	expect(program.statements.length).toBe(1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	expect(constraintDef.name).toBe('Show');
	expect(constraintDef.typeParams).toEqual(['a']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('show');
});

test('Constraint Definitions and Implementations - should parse implement definition', () => {
	const lexer = new Lexer(
		'implement Monad Option ( return = Some; bind = fn opt f => match opt with ( Some x => f x; None => None ) )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const implDef = assertImplementDefinitionExpression(program.statements[0]);
	expect(implDef.constraintName).toBe('Monad');
	expect(implDef.typeExpr.kind).toBe('variant');
	expect((implDef.typeExpr as any).name).toBe('Option');
	expect(implDef.implementations.length).toBe(2);
	expect(implDef.implementations[0].name).toBe('return');
	expect(implDef.implementations[1].name).toBe('bind');
});

test('Constraint Definitions and Implementations - should parse constraint with simple functions', () => {
	const lexer = new Lexer('constraint Eq a ( eq a : a -> a -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	expect(constraintDef.name).toBe('Eq');
	expect(constraintDef.typeParams).toEqual(['a']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('eq');
	expect(constraintDef.functions[0].typeParams).toEqual(['a']);
});

test('Constraint Definitions and Implementations - should parse constraint definition with multiple type parameters', () => {
	const lexer = new Lexer('constraint Eq a b ( eq : a -> b -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const constraintDef = assertConstraintDefinitionExpression(
		program.statements[0]
	);
	expect(constraintDef.name).toBe('Eq');
	expect(constraintDef.typeParams).toEqual(['a', 'b']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('eq');
});

