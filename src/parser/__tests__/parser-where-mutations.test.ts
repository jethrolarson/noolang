import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { WhereExpression, MutableDefinitionExpression, MutationExpression } from '../../ast';
import { describe, test, expect } from 'bun:test';

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
	expect(program.statements.length).toBe(1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	expect(whereExpr.main.kind).toBe('binary');
	expect(whereExpr.definitions.length).toBe(1);
	expect(whereExpr.definitions[0].kind).toBe('definition');
	expect((whereExpr.definitions[0] as any).name).toBe('x');
});

test('Where Expressions - should parse where expression with multiple definitions', () => {
	const lexer = new Lexer('x + y where ( x = 1; y = 2 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	expect(whereExpr.definitions.length).toBe(2);
	expect((whereExpr.definitions[0] as any).name).toBe('x');
	expect((whereExpr.definitions[1] as any).name).toBe('y');
});

test('Where Expressions - should parse where expression with mutable definition', () => {
	const lexer = new Lexer('x + y where ( mut x = 1; y = 2 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const whereExpr = assertWhereExpression(program.statements[0]);
	expect(whereExpr.definitions.length).toBe(2);
	expect(whereExpr.definitions[0].kind).toBe('mutable-definition');
	expect(whereExpr.definitions[1].kind).toBe('definition');
});

test('Mutable Definitions and Mutations - should parse mutable definition', () => {
	const lexer = new Lexer('mut x = 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutDef = assertMutableDefinitionExpression(program.statements[0]);
	expect(mutDef.name).toBe('x');
	expect(mutDef.value.kind).toBe('literal');
	expect((mutDef.value as any).value).toBe(42);
});

test('Mutable Definitions and Mutations - should parse mutation', () => {
	const lexer = new Lexer('mut! x = 100');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('x');
	expect(mutation.value.kind).toBe('literal');
	expect((mutation.value as any).value).toBe(100);
});

test('Mutable Definitions and Mutations - should parse mutable definition with complex expression', () => {
	const lexer = new Lexer('mut result = fn x => x * 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutDef = assertMutableDefinitionExpression(program.statements[0]);
	expect(mutDef.name).toBe('result');
	expect(mutDef.value.kind).toBe('function');
});

test('Mutable Definitions and Mutations - should parse mutation with complex expression', () => {
	const lexer = new Lexer('mut x = 0; mut! x = fn y => y + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// The parser combines statements with semicolons into binary expressions
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
});

test('Mutable Definitions and Mutations - should parse mutation expression syntax (semantic validity tested in type system)', () => {
	const lexer = new Lexer('mut! x = fn y => y + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('x');
	expect(mutation.value.kind).toBe('function');
});

test('Mutable Definitions and Mutations - should parse mutation with binary expression', () => {
	const lexer = new Lexer('mut! x = y + z');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('x');
	expect(mutation.value.kind).toBe('binary');
});

test('Mutable Definitions and Mutations - should parse mutation with if expression', () => {
	const lexer = new Lexer('mut! x = if y > 0 then 1 else 0');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('x');
	expect(mutation.value.kind).toBe('if');
});

test('Mutable Definitions and Mutations - should parse mutation with record expression', () => {
	const lexer = new Lexer('mut! point = {10, 20}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('point');
	expect(mutation.value.kind).toBe('tuple');
});

test('Mutable Definitions and Mutations - should parse mutation with list expression', () => {
	const lexer = new Lexer('mut! items = [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('items');
	expect(mutation.value.kind).toBe('list');
});

test('Mutable Definitions and Mutations - should parse mutation with function application', () => {
	const lexer = new Lexer('mut! result = add 1 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('result');
	expect(mutation.value.kind).toBe('application');
});

test('Mutable Definitions and Mutations - should parse mutation with accessor expression', () => {
	const lexer = new Lexer('mut! name = @name person');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('name');
	expect(mutation.value.kind).toBe('application');
});

test('Mutable Definitions and Mutations - should parse mutation with match expression', () => {
	const lexer = new Lexer(
		'mut! result = match x with (Some y => y; None => 0)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('result');
	expect(mutation.value.kind).toBe('match');
});

test('Mutable Definitions and Mutations - should parse mutation with where expression', () => {
	const lexer = new Lexer(
		'mut! result = value where (x = 1; y = 2; value = x + y)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('result');
	expect(mutation.value.kind).toBe('where');
});

test('Mutable Definitions and Mutations - should parse multiple mutations in sequence', () => {
	const lexer = new Lexer('mut x = 1; mut! x = 2; mut! x = 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// The parser combines statements with semicolons into binary expressions
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
});

test('Mutable Definitions and Mutations - should parse mutation with complex nested expressions', () => {
	const lexer = new Lexer('mut! result = if x > 0 then 1 else 0');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const mutation = assertMutationExpression(program.statements[0]);
	expect(mutation.target).toBe('result');
	expect(mutation.value.kind).toBe('if');
});

