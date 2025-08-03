import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import {
	assertBinaryExpression,
	assertPipelineExpression,
	assertVariableExpression,
} from '../../../test/utils';

test('Error Conditions - should throw error for unexpected token after expression', () => {
	const lexer = new Lexer('1 + +'); // Invalid double operator
	const tokens = lexer.tokenize();
	expect(() => parse(tokens)).toThrow();
});

test('Error Conditions - should throw error for parse error with line information', () => {
	const lexer = new Lexer('fn ==> 42'); // invalid double arrow
	const tokens = lexer.tokenize();
	expect(() => parse(tokens)).toThrow();
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
	expect(() => {
		const lexer = new Lexer('{ @name "Alice", 30 }'); // mixed named and positional
		const tokens = lexer.tokenize();
		parse(tokens);
	}).toThrow();
});

test('Error Conditions - should handle invalid field after comma in record', () => {
	// should handle trailing comma gracefully
	const lexer = new Lexer('{ @name "Alice", }'); // trailing comma with no field
	const tokens = lexer.tokenize();
	expect(() => parse(tokens)).not.toThrow();
});

test('Error Conditions - should handle invalid element after comma in list', () => {
	// should handle trailing comma gracefully
	const lexer = new Lexer('[1, 2, ]'); // trailing comma with no element
	const tokens = lexer.tokenize();
	expect(() => parse(tokens)).not.toThrow();
});

test('Operator Precedence - should parse operators with correct precedence', () => {
	const lexer = new Lexer('a + b * c');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const expr = program.statements[0];
	assertBinaryExpression(expr);
	expect(expr.operator).toBe('+');
	assertVariableExpression(expr.left);
	assertBinaryExpression(expr.right);
	assertBinaryExpression(expr.right);
	expect(expr.right.operator).toBe('*');
});

test('Operator Precedence - should parse comparison operators', () => {
	const lexer = new Lexer('a < b == c > d');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	// Due to left associativity, this parses as (((a < b) == c) > d)
	const expr = program.statements[0];
	assertBinaryExpression(expr);
	expect(expr.operator).toBe('>');
});

test('Operator Precedence - should parse composition operators', () => {
	const lexer = new Lexer('f |> g |> h');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const pipeline = program.statements[0];
	assertPipelineExpression(pipeline);
	expect(pipeline.steps.length).toBe(3);
});

test('Operator Precedence - should parse dollar operator', () => {
	const lexer = new Lexer('f $ g $ h');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const expr = program.statements[0];
	assertBinaryExpression(expr);
	expect(expr.operator).toBe('$');
});

