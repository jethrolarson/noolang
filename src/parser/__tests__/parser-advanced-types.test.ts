import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { parseTypeExpression } from '../parse-type';
import {
	assertListType,
	assertFunctionType,
	assertConstrainedExpression,
	assertImplementsConstraint,
	assertOrConstraint,
	assertTupleType,
	assertVariableType,
	assertVariantType,
	assertVariableExpression,
	assertPrimitiveType,
	assertIsConstraint,
	assertAndConstraint,
	assertParenConstraint,
} from '../../../test/utils';
import type { ParseResult, ParseSuccess } from '../../parser/combinators';
import { test, expect } from 'bun:test';

function parseType(typeSrc: string) {
	const lexer = new Lexer(typeSrc);
	const tokens = lexer.tokenize();
	return parseTypeExpression(tokens);
}

function assertParseSuccess<T>(
	result: ParseResult<T>
): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

test('Advanced Type Expressions - should parse Tuple type constructor', () => {
	const result = parseType('Tuple Float String Bool');
	assertParseSuccess(result);
	assertTupleType(result.value);
	const tupleConstructor = result.value;
	expect(tupleConstructor.elements.length).toBe(3);
});

test('Advanced Type Expressions - should parse parenthesized type expression', () => {
	const result = parseType('(Float -> String)');
	assertParseSuccess(result);
	assertFunctionType(result.value);
});

test('Advanced Type Expressions - should parse List type with generic parameter', () => {
	const result = parseType('List');
	assertParseSuccess(result);
	assertListType(result.value);
	const listType = result.value;
	assertVariableType(listType.element);
	expect(listType.element.name).toBe('a');
});

test('Advanced Type Expressions - should parse variant type with args', () => {
	const result = parseType('Maybe String');
	assertParseSuccess(result);
	assertVariantType(result.value);
	const variantType = result.value;
	expect(variantType.name).toBe('Maybe');
	assertPrimitiveType(variantType.args[0]);
	expect(variantType.args[0].name).toBe('String');
});

test('Constraint Expressions - should parse simple constraint expression', () => {
	const lexer = new Lexer('x : Float given a is Eq');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = program.statements[0];
	assertConstrainedExpression(constrained);
	assertVariableExpression(constrained.expression);
	assertPrimitiveType(constrained.type);
	assertIsConstraint(constrained.constraint);
	expect(constrained.constraint.typeVar).toBe('a');
	expect(constrained.constraint.constraint).toBe('Eq');
});

test('Constraint Expressions - should parse constraint with and operator', () => {
	const lexer = new Lexer('x : a given a is Eq and a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = program.statements[0];
	assertConstrainedExpression(constrained);
	assertAndConstraint(constrained.constraint);
	const andConstraint = constrained.constraint;
	assertIsConstraint(andConstraint.left);
	assertIsConstraint(andConstraint.right);
});

test('Constraint Expressions - should parse constraint with or operator', () => {
	const lexer = new Lexer('x : a given a is Eq or a is Ord');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = program.statements[0];
	assertConstrainedExpression(constrained);
	assertOrConstraint(constrained.constraint);
});

test('Constraint Expressions - should parse constraint with implements', () => {
	const lexer = new Lexer('x : a given a implements Iterable');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = program.statements[0];
	assertConstrainedExpression(constrained);
	assertImplementsConstraint(constrained.constraint);
	const implementsConstraint = constrained.constraint;
	expect(implementsConstraint.typeVar).toBe('a');
	expect(implementsConstraint.interfaceName).toBe('Iterable');
});

test('Constraint Expressions - should parse parenthesized constraint', () => {
	const lexer = new Lexer('x : a given (a is Eq and a is Ord) or a is Show');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = program.statements[0];
	assertConstrainedExpression(constrained);
	assertOrConstraint(constrained.constraint);
	const orConstraint = constrained.constraint;
	assertParenConstraint(orConstraint.left);
	assertIsConstraint(orConstraint.right);
});

