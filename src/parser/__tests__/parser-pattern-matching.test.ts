import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { MatchExpression } from '../../ast';

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
	assert.is(program.statements.length, 1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.expression.kind, 'variable');
	assert.is(matchExpr.cases.length, 2);
	assert.is(matchExpr.cases[0].pattern.kind, 'constructor');
	assert.is((matchExpr.cases[0].pattern as any).name, 'True');
	assert.is(matchExpr.cases[0].expression.kind, 'literal');
	assert.is((matchExpr.cases[0].expression as any).value, 1);
});

test('Pattern Matching - should parse match with variable patterns', () => {
	const lexer = new Lexer('match x with ( Some y => y; None => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.cases.length, 2);
	assert.is(matchExpr.cases[0].pattern.kind, 'constructor');
	assert.is((matchExpr.cases[0].pattern as any).name, 'Some');
	assert.is((matchExpr.cases[0].pattern as any).args.length, 1);
	assert.is((matchExpr.cases[0].pattern as any).args[0].kind, 'variable');
});

test('Pattern Matching - should parse match with wildcard patterns', () => {
	const lexer = new Lexer('match x with ( Some _ => 1; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.cases.length, 2);
	assert.is(matchExpr.cases[0].pattern.kind, 'constructor');
	// Note: _ is parsed as a variable pattern because it's an identifier in the lexer
	assert.is(matchExpr.cases[1].pattern.kind, 'variable');
	assert.is((matchExpr.cases[1].pattern as any).name, '_');
});

test('Pattern Matching - should parse match with literal patterns', () => {
	const lexer = new Lexer(
		'match x with ( 1 => "one"; "hello" => "world"; _ => "other" )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.cases.length, 3);
	assert.is(matchExpr.cases[0].pattern.kind, 'literal');
	assert.is((matchExpr.cases[0].pattern as any).value, 1);
	assert.is(matchExpr.cases[1].pattern.kind, 'literal');
	assert.is((matchExpr.cases[1].pattern as any).value, 'hello');
});

test('Pattern Matching - should parse match with nested constructor patterns', () => {
	const lexer = new Lexer('match x with ( Wrap (Value n) => n; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.cases.length, 2);
	assert.is(matchExpr.cases[0].pattern.kind, 'constructor');
	assert.is((matchExpr.cases[0].pattern as any).name, 'Wrap');
	assert.is((matchExpr.cases[0].pattern as any).args.length, 1);
	const nestedPattern = (matchExpr.cases[0].pattern as any).args[0];
	assert.is(nestedPattern.kind, 'constructor');
	assert.is(nestedPattern.name, 'Value');
});

test.run();