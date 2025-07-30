import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { MatchExpression } from '../../ast';
import { describe, test, expect } from 'bun:test';

// Helper function for type-safe testing
function assertMatchExpression(expr: any): MatchExpression {
	if (expr.kind !== 'match') {
		throw new Error(`Expected match expression, got ${expr.kind}`);
	}
	return expr;
}

test('Pattern Matching - should parse simple match expression', () => {
	const lexer = new Lexer('match x with ( True => 1; False => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.expression.kind).toBe('variable');
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('constructor');
	expect((matchExpr.cases[0].pattern as any).name).toBe('True');
	expect(matchExpr.cases[0].expression.kind).toBe('literal');
	expect((matchExpr.cases[0].expression as any).value).toBe(1);
});

test('Pattern Matching - should parse match with variable patterns', () => {
	const lexer = new Lexer('match x with ( Some y => y; None => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('constructor');
	expect((matchExpr.cases[0].pattern as any).name).toBe('Some');
	expect((matchExpr.cases[0].pattern as any).args.length).toBe(1);
	expect((matchExpr.cases[0].pattern as any).args[0].kind).toBe('variable');
});

test('Pattern Matching - should parse match with wildcard patterns', () => {
	const lexer = new Lexer('match x with ( Some _ => 1; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('constructor');
	// Note: _ is parsed as a variable pattern because it's an identifier in the lexer
	expect(matchExpr.cases[1].pattern.kind).toBe('variable');
	expect((matchExpr.cases[1].pattern as any).name).toBe('_');
});

test('Pattern Matching - should parse match with literal patterns', () => {
	const lexer = new Lexer(
		'match x with ( 1 => "one"; "hello" => "world"; _ => "other" )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.cases.length).toBe(3);
	expect(matchExpr.cases[0].pattern.kind).toBe('literal');
	expect((matchExpr.cases[0].pattern as any).value).toBe(1);
	expect(matchExpr.cases[1].pattern.kind).toBe('literal');
	expect((matchExpr.cases[1].pattern as any).value).toBe('hello');
});

test('Pattern Matching - should parse match with nested constructor patterns', () => {
	const lexer = new Lexer('match x with ( Wrap (Value n) => n; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('constructor');
	expect((matchExpr.cases[0].pattern as any).name).toBe('Wrap');
	expect((matchExpr.cases[0].pattern as any).args.length).toBe(1);
	const nestedPattern = (matchExpr.cases[0].pattern as any).args[0];
	expect(nestedPattern.kind).toBe('constructor');
	expect(nestedPattern.name).toBe('Value');
});

