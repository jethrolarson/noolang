import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { WhereExpression, MutableDefinitionExpression, MutationExpression } from '../../ast';

// Helper functions for type-safe testing
function assertWhereExpression(expr: any): WhereExpression {
	if (expr.kind !== 'where') {
		throw new Error(`Expected where expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMutableDefinitionExpression(expr: any): MutableDefinitionExpression {
	if (expr.kind !== 'mutable-definition') {
		throw new Error(`Expected mutable definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMutationExpression(expr: any): MutationExpression {
	if (expr.kind !== 'mutation') {
		throw new Error(`Expected mutation expression, got ${expr.kind}`);
	}
	return expr;
}

test('Where Expressions - should parse where expression with single definition', () => {
	const lexer = new Lexer('x + y where ( x = 1 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	assert.is(whereExpr.main.kind, 'binary');
	assert.is(whereExpr.definitions.length, 1);
	assert.is(whereExpr.definitions[0].kind, 'definition');
	assert.is((whereExpr.definitions[0] as any).name, 'x');
});

test('Where Expressions - should parse where expression with multiple definitions', () => {
	const lexer = new Lexer('x + y where ( x = 1; y = 2 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	assert.is(whereExpr.definitions.length, 2);
	assert.is((whereExpr.definitions[0] as any).name, 'x');
	assert.is((whereExpr.definitions[1] as any).name, 'y');
});

test('Where Expressions - should parse where expression with mutable definition', () => {
	const lexer = new Lexer('x + y where ( mut x = 1; y = 2 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	assert.is(whereExpr.definitions.length, 2);
	assert.is(whereExpr.definitions[0].kind, 'mutable-definition');
	assert.is(whereExpr.definitions[1].kind, 'definition');
});

test('Mutable Definitions and Mutations - should parse mutable definition', () => {
	const lexer = new Lexer('mut x = 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutDef = assertMutableDefinitionExpression(program.statements[0]);
	assert.is(mutDef.name, 'x');
	assert.is(mutDef.value.kind, 'literal');
	assert.is((mutDef.value as any).value, 42);
});

test('Mutable Definitions and Mutations - should parse mutation', () => {
	const lexer = new Lexer('mut! x = 100');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'x');
	assert.is(mutation.value.kind, 'literal');
	assert.is((mutation.value as any).value, 100);
});

test('Mutable Definitions and Mutations - should parse mutable definition with complex expression', () => {
	const lexer = new Lexer('mut result = fn x => x * 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutDef = assertMutableDefinitionExpression(program.statements[0]);
	assert.is(mutDef.name, 'result');
	assert.is(mutDef.value.kind, 'function');
});

test('Mutable Definitions and Mutations - should parse mutation with complex expression', () => {
	const lexer = new Lexer('mut x = 0; mut! x = fn y => y + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// The parser combines statements with semicolons into binary expressions
	assert.is(program.statements.length, 1);
	assert.is(program.statements[0].kind, 'binary');
});

test('Mutable Definitions and Mutations - should parse mutation expression syntax (semantic validity tested in type system)', () => {
	const lexer = new Lexer('mut! x = fn y => y + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'x');
	assert.is(mutation.value.kind, 'function');
});

test('Mutable Definitions and Mutations - should parse mutation with binary expression', () => {
	const lexer = new Lexer('mut! x = y + z');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'x');
	assert.is(mutation.value.kind, 'binary');
});

test('Mutable Definitions and Mutations - should parse mutation with if expression', () => {
	const lexer = new Lexer('mut! x = if y > 0 then 1 else 0');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'x');
	assert.is(mutation.value.kind, 'if');
});

test('Mutable Definitions and Mutations - should parse mutation with record expression', () => {
	const lexer = new Lexer('mut! point = {10, 20}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'point');
	assert.is(mutation.value.kind, 'tuple');
});

test('Mutable Definitions and Mutations - should parse mutation with list expression', () => {
	const lexer = new Lexer('mut! items = [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'items');
	assert.is(mutation.value.kind, 'list');
});

test('Mutable Definitions and Mutations - should parse mutation with function application', () => {
	const lexer = new Lexer('mut! result = add 1 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'result');
	assert.is(mutation.value.kind, 'application');
});

test('Mutable Definitions and Mutations - should parse mutation with accessor expression', () => {
	const lexer = new Lexer('mut! name = @name person');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'name');
	assert.is(mutation.value.kind, 'application');
});

test('Mutable Definitions and Mutations - should parse mutation with match expression', () => {
	const lexer = new Lexer(
		'mut! result = match x with (Some y => y; None => 0)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'result');
	assert.is(mutation.value.kind, 'match');
});

test('Mutable Definitions and Mutations - should parse mutation with where expression', () => {
	const lexer = new Lexer(
		'mut! result = value where (x = 1; y = 2; value = x + y)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'result');
	assert.is(mutation.value.kind, 'where');
});

test('Mutable Definitions and Mutations - should parse multiple mutations in sequence', () => {
	const lexer = new Lexer('mut x = 1; mut! x = 2; mut! x = 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// The parser combines statements with semicolons into binary expressions
	assert.is(program.statements.length, 1);
	assert.is(program.statements[0].kind, 'binary');
});

test('Mutable Definitions and Mutations - should parse mutation with complex nested expressions', () => {
	const lexer = new Lexer('mut! result = if x > 0 then 1 else 0');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const mutation = assertMutationExpression(program.statements[0]);
	assert.is(mutation.target, 'result');
	assert.is(mutation.value.kind, 'if');
});

test.run();