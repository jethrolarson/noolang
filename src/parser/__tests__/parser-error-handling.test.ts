import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { BinaryExpression } from '../../ast';
import { describe, test, expect } from 'bun:test';

// Helper function for type-safe testing
function assertBinaryExpression(expr: any): BinaryExpression {
	if (expr.kind !== 'binary') {
		throw new Error(`Expected binary expression, got ${expr.kind}`);
	}
	return expr;
}

test('Error Conditions - should throw error for unexpected token after expression', () => {
	const lexer = new Lexer('1 + +'); // Invalid double operator
	const tokens = lexer.tokenize();
	expect(() => parse(tokens).toThrow(), /Parse error/);
});

test('Error Conditions - should throw error for parse error with line information', () => {
	const lexer = new Lexer('fn ==> 42'); // invalid double arrow
	const tokens = lexer.tokenize();
	expect(() => parse(tokens).toThrow(), /Parse error/);
});

test('Error Conditions - should handle empty input', () => {
	const lexer = new Lexer('');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(0);
});

test('Error Conditions - should handle only semicolons', () => {
	const lexer = new Lexer(';;;;');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(0);
});

test('Error Conditions - should handle mixed named and positional fields error', () => {
	expect(().toThrow() => {
		const lexer = new Lexer('{ @name "Alice", 30 }'); // mixed named and positional
		const tokens = lexer.tokenize();
		parse(tokens);
	}, /Parse error/);
});

test('Error Conditions - should handle invalid field after comma in record', () => {
	// should handle trailing comma gracefully
	const lexer = new Lexer('{ @name "Alice", }'); // trailing comma with no field
	const tokens = lexer.tokenize();
	expect(().not.toThrow() => parse(tokens));
});

test('Error Conditions - should handle invalid element after comma in list', () => {
	// should handle trailing comma gracefully
	const lexer = new Lexer('[1, 2, ]'); // trailing comma with no element
	const tokens = lexer.tokenize();
	expect(().not.toThrow() => parse(tokens));
});

test('Operator Precedence - should parse operators with correct precedence', () => {
	const lexer = new Lexer('a + b * c');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const expr = assertBinaryExpression(program.statements[0]);
	expect(expr.operator).toBe('+');
	expect(expr.left.kind).toBe('variable');
	expect(expr.right.kind).toBe('binary');
	const rightExpr = assertBinaryExpression(expr.right);
	expect(rightExpr.operator).toBe('*');
});

test('Operator Precedence - should parse comparison operators', () => {
	const lexer = new Lexer('a < b == c > d');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	// Due to left associativity, this parses as (((a < b) == c) > d)
	const expr = assertBinaryExpression(program.statements[0]);
	expect(expr.operator).toBe('>');
});

test('Operator Precedence - should parse composition operators', () => {
	const lexer = new Lexer('f |> g |> h');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const pipeline = program.statements[0] as any;
	expect(pipeline.kind).toBe('pipeline');
	expect(pipeline.steps.length).toBe(3);
});

test('Operator Precedence - should parse dollar operator', () => {
	const lexer = new Lexer('f $ g $ h');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const expr = assertBinaryExpression(program.statements[0]);
	expect(expr.operator).toBe('$');
});

