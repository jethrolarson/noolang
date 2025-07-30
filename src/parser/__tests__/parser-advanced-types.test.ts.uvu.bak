import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import type { ConstrainedExpression, ParseResult, ParseSuccess } from '../../ast';

// Helper functions for type-safe testing
function assertConstrainedExpression(expr: any): ConstrainedExpression {
	if (expr.kind !== 'constrained') {
		throw new Error(`Expected constrained expression, got ${expr.kind}`);
	}
	return expr;
}

function assertParseSuccess<T>(result: ParseResult<T>): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

function assertFunctionType(type: any): void {
	if (type.kind !== 'function') {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}

function assertListType(type: any): void {
	if (type.kind !== 'list') {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}

test('Advanced Type Expressions - should parse Tuple type constructor', () => {
	const lexer = new Lexer('Tuple Float String Bool');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assert.is(result.value.kind, 'tuple');
	const tupleConstructor = result.value as any;
	assert.is(tupleConstructor.elements.length, 3);
});

test('Advanced Type Expressions - should parse parenthesized type expression', () => {
	const lexer = new Lexer('(Float -> String)');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertFunctionType(result.value);
});

test('Advanced Type Expressions - should parse List type with generic parameter', () => {
	const lexer = new Lexer('List');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertListType(result.value);
	const listType = result.value;
	assert.is(listType.element.kind, 'variable');
	assert.is((listType.element as any).name, 'a');
});

test('Advanced Type Expressions - should parse variant type with args', () => {
	const lexer = new Lexer('Maybe String');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assert.is(result.value.kind, 'variant');
	const variantType = result.value as any;
	assert.is(variantType.name, 'Maybe');
	assert.is(variantType.args.length, 1);
});

test('Constraint Expressions - should parse simple constraint expression', () => {
	const lexer = new Lexer('x : Float given a is Eq');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	assert.is(constrained.expression.kind, 'variable');
	assert.is(constrained.type.kind, 'primitive');
	assert.is(constrained.constraint.kind, 'is');
	assert.is((constrained.constraint as any).typeVar, 'a');
	assert.is((constrained.constraint as any).constraint, 'Eq');
});

test('Constraint Expressions - should parse constraint with and operator', () => {
	const lexer = new Lexer('x : a given a is Eq and a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	assert.is(constrained.constraint.kind, 'and');
	const andConstraint = constrained.constraint as any;
	assert.is(andConstraint.left.kind, 'is');
	assert.is(andConstraint.right.kind, 'is');
});

test('Constraint Expressions - should parse constraint with or operator', () => {
	const lexer = new Lexer('x : a given a is Eq or a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	assert.is(constrained.constraint.kind, 'or');
});

test('Constraint Expressions - should parse constraint with implements', () => {
	const lexer = new Lexer('x : a given a implements Iterable');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	assert.is(constrained.constraint.kind, 'implements');
	const implementsConstraint = constrained.constraint as any;
	assert.is(implementsConstraint.typeVar, 'a');
	assert.is(implementsConstraint.interfaceName, 'Iterable');
});

test('Constraint Expressions - should parse parenthesized constraint', () => {
	const lexer = new Lexer('x : a given (a is Eq and a is Ord) or a is Show');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	assert.is(constrained.constraint.kind, 'or');
	const orConstraint = constrained.constraint as any;
	assert.is(orConstraint.left.kind, 'paren');
	assert.is(orConstraint.right.kind, 'is');
});

test.run();