import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import {
	assertConstructorPattern,
	assertLiteralExpression,
	assertLiteralPattern,
	assertMatchExpression,
	assertVariableExpression,
	assertVariablePattern,
	assertWildcardPattern,
} from '../../../test/utils';

test('Pattern Matching - should parse simple match expression', () => {
	const lexer = new Lexer('match x ( True => 1; False => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	assertVariableExpression(matchExpr.expression);
	expect(matchExpr.cases.length).toBe(2);
	assertConstructorPattern(matchExpr.cases[0].pattern);
	expect(matchExpr.cases[0].pattern.name).toBe('True');
	assertLiteralExpression(matchExpr.cases[0].expression);
	expect(matchExpr.cases[0].expression.value).toBe(1);
});

test('Pattern Matching - should parse match with variable patterns', () => {
	const lexer = new Lexer('match x ( Some y => y; None => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(2);
	const case0 = matchExpr.cases[0];
	assertConstructorPattern(case0.pattern);
	expect(case0.pattern.name).toBe('Some');
	assertVariablePattern(case0.pattern.args[0]);
});

test('Pattern Matching - should parse match with wildcard patterns', () => {
	const lexer = new Lexer('match x ( Some _ => 1; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(2);
	const case0 = matchExpr.cases[0];
	assertConstructorPattern(case0.pattern);
	expect(case0.pattern.name).toBe('Some');
	assertWildcardPattern(case0.pattern.args[0]);
});

test('Pattern Matching - should parse match with literal patterns', () => {
	const lexer = new Lexer(
		'match x ( 1 => "one"; "hello" => "world"; _ => "other" )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(3);
	assertLiteralPattern(matchExpr.cases[0].pattern);
	expect(matchExpr.cases[0].pattern.value).toBe(1);
	assertLiteralPattern(matchExpr.cases[1].pattern);
	expect(matchExpr.cases[1].pattern.value).toBe('hello');
});

test('Pattern Matching - should parse match with nested constructor patterns', () => {
	const lexer = new Lexer('match x ( Wrap (Value n) => n; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(2);
	assertConstructorPattern(matchExpr.cases[0].pattern);
	expect(matchExpr.cases[0].pattern.name).toBe('Wrap');
	assertConstructorPattern(matchExpr.cases[0].pattern.args[0]);
	expect(matchExpr.cases[0].pattern.args[0].name).toBe('Value');
});

test('Pattern Matching - should parse match with trailing semicolons in cases', () => {
	const lexer = new Lexer('match x ( True => 1; False => 0;;;; )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(2);
});

