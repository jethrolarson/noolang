import { Lexer, Token } from '../../lexer/lexer';
import { parse } from '../parser';
import { parseTypeExpression } from '../parse-type';
import { test, expect, describe } from 'bun:test';
import {
	assertParseError,
	assertParseSuccess,
	assertUnitExpression,
	assertListExpression,
	assertConstrainedExpression,
	assertRecordType,
	assertTupleType,
	assertFunctionType,
	assertVariableType,
	assertListType,
	assertPrimitiveType,
	assertBinaryExpression,
	assertParenConstraint,
	assertLiteralExpression,
} from '../../../test/utils';

describe('Parser Edge Cases', () => {
	test('should handle empty input for type expressions', () => {
		const tokens: Token[] = [];
		const result = parseTypeExpression(tokens);
		assertParseError(result);
		expect(result.error.includes('Expected type expression')).toBeTruthy();
	});

	test('should handle invalid tokens for type expressions', () => {
		const lexer = new Lexer('@invalid');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseError(result);
		expect(result.error.includes('Expected type expression')).toBeTruthy();
	});

	test('should parse Unit type correctly', () => {
		const lexer = new Lexer('Unit');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		expect(result.value.kind).toBe('unit');
	});

	test('should parse Float type correctly', () => {
		const lexer = new Lexer('Float');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertPrimitiveType(result.value);
		expect(result.value.name).toBe('Float');
	});

	test('should handle incomplete function type', () => {
		const lexer = new Lexer('Float ->');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseError(result);
	});

	test('should handle invalid effect name', () => {
		const lexer = new Lexer('Float -> Float !invalideffect');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseError(result);
		expect(result.error.includes('Invalid effect: invalideffect')).toBeTruthy();
	});

	test('should handle missing effect name after exclamation', () => {
		const lexer = new Lexer('Float -> Float !');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseError(result);
		expect(result.error.includes('Expected effect name after !')).toBeTruthy();
	});

	test('should handle generic List type', () => {
		const lexer = new Lexer('List');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertListType(result.value);
		assertVariableType(result.value.element);
		expect(result.value.element.name).toBe('a');
	});

	test('should handle List type with argument', () => {
		const lexer = new Lexer('List String');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertListType(result.value);
		assertPrimitiveType(result.value.element);
	});

	test('should handle empty record fields', () => {
		const lexer = new Lexer('{ }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		assertUnitExpression(program.statements[0]);
	});

	test('should handle empty list elements', () => {
		const lexer = new Lexer('[]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		assertListExpression(program.statements[0]);
		expect(program.statements[0].elements.length).toBe(0);
	});

	test('should handle adjacent minus for unary operator', () => {
		const lexer = new Lexer('-123');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const binary = program.statements[0];
		assertBinaryExpression(binary);
		expect(binary.operator).toBe('*');
		assertLiteralExpression(binary.left);
		expect(binary.left.value).toBe(-1);
		assertLiteralExpression(binary.right);
		expect(binary.right.value).toBe(123);
	});

	test('should handle non-adjacent minus for binary operator', () => {
		const lexer = new Lexer('a - b');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const binary = program.statements[0];
		assertBinaryExpression(binary);
		expect(binary.operator).toBe('-');
	});

	test('should handle function type without effects fallback', () => {
		const lexer = new Lexer('String -> Float');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertFunctionType(result.value);
		expect([...result.value.effects]).toEqual([]);
	});

	test('should handle lowercase type variable', () => {
		const lexer = new Lexer('a');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertVariableType(result.value);
		expect(result.value.name).toBe('a');
	});

	test('should handle record type edge case', () => {
		const lexer = new Lexer('{ name: String }');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertRecordType(result.value);
		expect(result.value.fields).toHaveProperty('name');
	});

	test('should handle tuple type edge case', () => {
		const lexer = new Lexer('{ String, Float }');
		const tokens = lexer.tokenize();
		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertTupleType(result.value);
		expect(result.value.elements.length).toBe(2);
	});

	test('should handle unexpected token types in primary parser', () => {
		// Create a mock token with an unexpected type
		const tokens: Token[] = [
			{
				type: 'COMMENT',
				value: '# comment',
				location: {
					start: { line: 1, column: 1 },
					end: { line: 1, column: 9 },
				},
			},
		];
		expect(() => parse(tokens)).toThrow();
	});

	test('should handle various punctuation cases', () => {
		const testCases = ['(', '[', '{'];

		for (const testCase of testCases) {
			const lexer = new Lexer(testCase);
			const tokens = lexer.tokenize();
			expect(() => parse(tokens)).toThrow();
		}
	});

	test('should handle type atom parsing edge cases', () => {
		// Test various edge cases that might not be covered
		const testCases = [
			'(Float -> String)',
			'Maybe Float',
			'Either String Float',
		];

		for (const testCase of testCases) {
			const lexer = new Lexer(testCase);
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			assertParseSuccess(result);
		}
	});

	test('should handle constraint expression edge cases', () => {
		const lexer = new Lexer('x : a given (a is Eq)');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const constrained = program.statements[0];
		assertConstrainedExpression(constrained);
		assertParenConstraint(constrained.constraint);
	});

	test('should handle complex parsing edge cases for coverage', () => {
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
});