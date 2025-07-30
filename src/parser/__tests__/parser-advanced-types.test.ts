import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import type { ConstrainedExpression, ParseResult, ParseSuccess } from '../../ast';
import { describe, test, expect } from 'bun:test';

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
	expect(result.value.kind).toBe('tuple');
	const tupleConstructor = result.value as any;
	expect(tupleConstructor.elements.length).toBe(3);
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
	expect(listType.element.kind).toBe('variable');
	expect((listType.element as any).name).toBe('a');
});

test('Advanced Type Expressions - should parse variant type with args', () => {
	const lexer = new Lexer('Maybe String');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	expect(result.value.kind).toBe('variant');
	const variantType = result.value as any;
	expect(variantType.name).toBe('Maybe');
	expect(variantType.args.length).toBe(1);
});

test('Constraint Expressions - should parse simple constraint expression', () => {
	const lexer = new Lexer('x : Float given a is Eq');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.expression.kind).toBe('variable');
	expect(constrained.type.kind).toBe('primitive');
	expect(constrained.constraint.kind).toBe('is');
	expect((constrained.constraint as any).typeVar).toBe('a');
	expect((constrained.constraint as any).constraint).toBe('Eq');
});

test('Constraint Expressions - should parse constraint with and operator', () => {
	const lexer = new Lexer('x : a given a is Eq and a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.constraint.kind).toBe('and');
	const andConstraint = constrained.constraint as any;
	expect(andConstraint.left.kind).toBe('is');
	expect(andConstraint.right.kind).toBe('is');
});

test('Constraint Expressions - should parse constraint with or operator', () => {
	const lexer = new Lexer('x : a given a is Eq or a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.constraint.kind).toBe('or');
});

test('Constraint Expressions - should parse constraint with implements', () => {
	const lexer = new Lexer('x : a given a implements Iterable');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.constraint.kind).toBe('implements');
	const implementsConstraint = constrained.constraint as any;
	expect(implementsConstraint.typeVar).toBe('a');
	expect(implementsConstraint.interfaceName).toBe('Iterable');
});

test('Constraint Expressions - should parse parenthesized constraint', () => {
	const lexer = new Lexer('x : a given (a is Eq and a is Ord) or a is Show');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.constraint.kind).toBe('or');
	const orConstraint = constrained.constraint as any;
	expect(orConstraint.left.kind).toBe('paren');
	expect(orConstraint.right.kind).toBe('is');
});

