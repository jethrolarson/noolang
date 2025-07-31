import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import type { ParseResult, ParseSuccess, ParseError } from '../../parser/combinators';
import type { UnitExpression, ConstrainedExpression } from '../../ast';
import { describe, test, expect } from 'bun:test';

// Helper functions for type-safe testing
function assertParseSuccess<T>(result: ParseResult<T>): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

function assertParseError<T>(result: ParseResult<T>): asserts result is ParseError {
	if (result.success) {
		throw new Error(`Expected parse error, got success: (${JSON.stringify(result)})`);
	}
}

function assertUnitExpression(expr: any): UnitExpression {
	if (expr.kind !== 'unit') {
		throw new Error(`Expected unit expression, got ${expr.kind}`);
	}
	return expr;
}

function assertConstrainedExpression(expr: any): ConstrainedExpression {
	if (expr.kind !== 'constrained') {
		throw new Error(`Expected constrained expression, got ${expr.kind}`);
	}
	return expr;
}

function assertListType(type: any): void {
	if (type.kind !== 'list') {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}

function assertVariableType(type: any): void {
	if (type.kind !== 'variable') {
		throw new Error(`Expected variable type, got ${type.kind}`);
	}
}

function assertFunctionType(type: any): void {
	if (type.kind !== 'function') {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}

function assertRecordType(type: any): void {
	if (type.kind !== 'record') {
		throw new Error(`Expected record type, got ${type.kind}`);
	}
}

function assertTupleType(type: any): void {
	if (type.kind !== 'tuple') {
		throw new Error(`Expected tuple type, got ${type.kind}`);
	}
}

test('Edge Cases and Error Conditions - should handle empty input for type expressions', () => {
	const tokens: any[] = [];
	const result = parseTypeExpression(tokens);
	assertParseError(result);
	expect(result.error.includes('Expected type expression')).toBeTruthy();
});

test('Edge Cases and Error Conditions - should handle invalid tokens for type expressions', () => {
	const lexer = new Lexer('@invalid');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseError(result);
	expect(result.error.includes('Expected type expression')).toBeTruthy();
});

test('Edge Cases and Error Conditions - should parse Unit type correctly', () => {
	const lexer = new Lexer('Unit');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	expect(result.value.kind).toBe('unit');
});

test('Edge Cases and Error Conditions - should parse Float type correctly', () => {
	const lexer = new Lexer('Float');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	expect(result.value.kind).toBe('primitive');
	expect((result.value as any).name).toBe('Float');
});

test('Edge Cases and Error Conditions - should handle incomplete function type', () => {
	const lexer = new Lexer('Float ->');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseError(result);
});

test('Edge Cases and Error Conditions - should handle invalid effect name', () => {
	const lexer = new Lexer('Float -> Float !invalideffect');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseError(result);
	expect(result.error.includes('Invalid effect: invalideffect')).toBeTruthy();
});

test('Edge Cases and Error Conditions - should handle missing effect name after exclamation', () => {
	const lexer = new Lexer('Float -> Float !');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseError(result);
	expect(result.error.includes('Expected effect name after !')).toBeTruthy();
});

test('Edge Cases and Error Conditions - should handle generic List type', () => {
	const lexer = new Lexer('List');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertListType(result.value);
	expect(result.value.element.kind).toBe('variable');
	expect((result.value.element as any).name).toBe('a');
});

test('Edge Cases and Error Conditions - should handle List type with argument', () => {
	const lexer = new Lexer('List String');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertListType(result.value);
	expect(result.value.element.kind).toBe('primitive');
});

test('Edge Cases and Error Conditions - should handle empty record fields', () => {
	const lexer = new Lexer('{ }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const unit = assertUnitExpression(program.statements[0]);
	expect(unit.kind).toBe('unit');
});

test('Edge Cases and Error Conditions - should handle empty list elements', () => {
	const lexer = new Lexer('[]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('list');
	const list = program.statements[0] as any;
	expect(list.elements.length).toBe(0);
});

test('Edge Cases and Error Conditions - should handle adjacent minus for unary operator', () => {
	const lexer = new Lexer('-123');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
	const binary = program.statements[0] as any;
	expect(binary.operator).toBe('*');
	expect(binary.left.value).toBe(-1);
	expect(binary.right.value).toBe(123);
});

test('Edge Cases and Error Conditions - should handle non-adjacent minus for binary operator', () => {
	const lexer = new Lexer('a - b');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
	const binary = program.statements[0] as any;
	expect(binary.operator).toBe('-');
});

test('Edge Cases and Error Conditions - should handle function type without effects fallback', () => {
	const lexer = new Lexer('String -> Float');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertFunctionType(result.value);
	expect([...result.value.effects]).toEqual([]);
});

test('Edge Cases and Error Conditions - should handle lowercase type variable', () => {
	const lexer = new Lexer('a');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertVariableType(result.value);
	expect(result.value.name).toBe('a');
});

test('Edge Cases and Error Conditions - should handle record type edge case', () => {
	const lexer = new Lexer('{ name: String }');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertRecordType(result.value);
	expect(result.value.fields.hasOwnProperty('name')).toBeTruthy();
});

test('Edge Cases and Error Conditions - should handle tuple type edge case', () => {
	const lexer = new Lexer('{ String, Float }');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);
	assertParseSuccess(result);
	assertTupleType(result.value);
	expect(result.value.elements.length).toBe(2);
});

test('Edge Cases and Error Conditions - should handle unexpected token types in primary parser', () => {
	// Create a mock token with an unexpected type
	const tokens = [
		{
			type: 'COMMENT' as any,
			value: '# comment',
			location: {
				start: { line: 1, column: 1 },
				end: { line: 1, column: 9 },
			},
		},
	];
	expect(() => parse(tokens)).toThrow();
});

test('Edge Cases and Error Conditions - should handle various punctuation cases', () => {
	const testCases = ['(', '[', '{'];

	for (const testCase of testCases) {
		const lexer = new Lexer(testCase);
		const tokens = lexer.tokenize();
		expect(() => parse(tokens)).toThrow();
	}
});

test('Edge Cases and Error Conditions - should handle type atom parsing edge cases', () => {
	// Test various edge cases that might not be covered
	const testCases = ['(Float -> String)', 'Maybe Float', 'Either String Float'];

	for (const testCase of testCases) {
		const lexer = new Lexer(testCase);
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
	}
});

test('Edge Cases and Error Conditions - should handle constraint expression edge cases', () => {
	const lexer = new Lexer('x : a given (a is Eq)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constrained = assertConstrainedExpression(program.statements[0]);
	expect(constrained.constraint.kind).toBe('paren');
});

test('Edge Cases and Error Conditions - should handle complex parsing edge cases for coverage', () => {
	// Test some complex parsing scenarios
	const testCases = [
		'fn x y z => x + y + z',
		'(fn x => x) 42',
		'[1, 2, 3] |> map |> filter',
		'{ @a 1, @b 2, @c 3 }',
		'match x with ( Some y => y + 1; None => 0 )',
	];

	for (const testCase of testCases) {
		const lexer = new Lexer(testCase);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
	}
});

