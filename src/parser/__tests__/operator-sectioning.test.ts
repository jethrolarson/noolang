import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect, describe } from 'bun:test';
import { assertFunctionExpression, assertBinaryExpression } from '../../../test/utils';
import { expectSuccess } from '../../../test/utils';

describe('Operator sectioning: (op) desugars to fn a b => a op b', () => {
	test('(<) parses to a two-param function applying "<"', () => {
		const lexer = new Lexer('(<)');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements.length).toBe(1);
		const expr = program.statements[0];
		assertFunctionExpression(expr);
		expect(expr.params).toHaveLength(2);
		assertBinaryExpression(expr.body);
		expect(expr.body.operator).toBe('<');
	});

	test('(+) evaluates and applies like the infix operator', () => {
		expectSuccess('(+) 1 2', 3);
	});

	test('(<) used as a first-class comparator with sort_by', () => {
		expectSuccess('sort_by (<) [3, 1, 4, 1, 5]', [1, 1, 3, 4, 5]);
	});

	test('parenthesized negative literal still parses as a literal, not a section', () => {
		expectSuccess('(-5)', -5);
	});

	test('a normal parenthesized expression is unaffected', () => {
		expectSuccess('(1 + 2)', 3);
	});

	test('(=) is not sectionable - "=" is assignment punctuation, not a binary operator', () => {
		const lexer = new Lexer('(=)');
		const tokens = lexer.tokenize();
		expect(() => parse(tokens)).toThrow();
	});
});
