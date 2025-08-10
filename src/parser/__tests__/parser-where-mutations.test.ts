import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect, describe } from 'bun:test';
import {
	assertWhereExpression,
	assertMutableDefinitionExpression,
	assertMutationExpression,
	assertDefinitionExpression,
	assertLiteralExpression,
	assertFunctionExpression,
	assertBinaryExpression,
	assertIfExpression,
	assertTupleExpression,
	assertListExpression,
	assertApplicationExpression,
	assertMatchExpression,
} from '../../../test/utils';

describe('Where Expressions', () => {
	test('should parse where expression with single definition', () => {
		const lexer = new Lexer('x + y where ( x = 1 )');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const whereExpr = program.statements[0];
		assertWhereExpression(whereExpr);
		expect(whereExpr.main.kind).toBe('binary');
		expect(whereExpr.definitions.length).toBe(1);
		assertDefinitionExpression(whereExpr.definitions[0]);
		expect(whereExpr.definitions[0].name).toBe('x');
	});

	test('should parse where expression with multiple definitions', () => {
		const lexer = new Lexer('x + y where ( x = 1; y = 2 )');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const whereExpr = program.statements[0];
		assertWhereExpression(whereExpr);
		expect(whereExpr.definitions.length).toBe(2);
		assertDefinitionExpression(whereExpr.definitions[0]);
		expect(whereExpr.definitions[0].name).toBe('x');
		assertDefinitionExpression(whereExpr.definitions[1]);
		expect(whereExpr.definitions[1].name).toBe('y');
	});

	test('should parse where expression with mutable definition', () => {
		const lexer = new Lexer('x + y where ( mut x = 1; y = 2 )');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const whereExpr = program.statements[0];
		assertWhereExpression(whereExpr);
		expect(whereExpr.definitions.length).toBe(2);
		assertMutableDefinitionExpression(whereExpr.definitions[0]);
		assertDefinitionExpression(whereExpr.definitions[1]);
	});

	// TODO fix where not working in function bodies
	test('should parse where expression in function body', () => {
		const lexer = new Lexer('fn x => x where (x = 1)');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const funcExpr = program.statements[0];
		assertFunctionExpression(funcExpr);
		expect(funcExpr.params).toEqual(['x']);
		assertWhereExpression(funcExpr.body);
		expect(funcExpr.body.definitions.length).toBe(1);
		assertDefinitionExpression(funcExpr.body.definitions[0]);
		expect(funcExpr.body.definitions[0].name).toBe('x');
	});

	test('should parse where expression in function body with multiple definitions', () => {
		const lexer = new Lexer('fn x => x where (x = 1; y = 2)');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const funcExpr = program.statements[0];
		assertFunctionExpression(funcExpr);
		expect(funcExpr.params).toEqual(['x']);
		assertWhereExpression(funcExpr.body);
		expect(funcExpr.body.definitions.length).toBe(2);
		assertDefinitionExpression(funcExpr.body.definitions[0]);
		expect(funcExpr.body.definitions[0].name).toBe('x');
		assertDefinitionExpression(funcExpr.body.definitions[1]);
		expect(funcExpr.body.definitions[1].name).toBe('y');
	});

	test('should allow trailing semicolons in where definitions', () => {
		const lexer = new Lexer('x + y where ( x = 1; y = 2;;; )');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const whereExpr = program.statements[0];
		assertWhereExpression(whereExpr);
		expect(whereExpr.definitions.length).toBe(2);
	});

	test('should allow trailing semicolons in where definitions inside function body', () => {
		const lexer = new Lexer('fn x => x where (x = 1; y = 2;;; )');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const funcExpr = program.statements[0];
		assertFunctionExpression(funcExpr);
		assertWhereExpression(funcExpr.body);
		expect(funcExpr.body.definitions.length).toBe(2);
	});
});

describe('Mutable Definitions and Mutations', () => {
	test('should parse mutable definition', () => {
		const lexer = new Lexer('mut x = 42');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutDef = program.statements[0];
		assertMutableDefinitionExpression(mutDef);
		expect(mutDef.name).toBe('x');
		assertLiteralExpression(mutDef.value);
		expect(mutDef.value.value).toBe(42);
	});

	test('should parse mutation', () => {
		const lexer = new Lexer('mut! x = 100');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('x');
		assertLiteralExpression(mutation.value);
		expect(mutation.value.value).toBe(100);
	});

	test('should parse mutable definition with complex expression', () => {
		const lexer = new Lexer('mut result = fn x => x * 2');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutDef = program.statements[0];
		assertMutableDefinitionExpression(mutDef);
		expect(mutDef.name).toBe('result');
		assertFunctionExpression(mutDef.value);
	});

	test('should parse mutation with complex expression', () => {
		const lexer = new Lexer('mut x = 0; mut! x = fn y => y + 1');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		// The parser combines statements with semicolons into binary expressions
		expect(program.statements.length).toBe(1);
		expect(program.statements[0].kind).toBe('binary');
	});

	test('should parse mutation expression syntax (semantic validity tested in type system)', () => {
		const lexer = new Lexer('mut! x = fn y => y + 1');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('x');
		assertFunctionExpression(mutation.value);
	});

	test('should parse mutation with binary expression', () => {
		const lexer = new Lexer('mut! x = y + z');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('x');
		assertBinaryExpression(mutation.value);
	});

	test('should parse mutation with if expression', () => {
		const lexer = new Lexer('mut! x = if y > 0 then 1 else 0');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('x');
		assertIfExpression(mutation.value);
	});

	test('should parse mutation with record expression', () => {
		const lexer = new Lexer('mut! point = {10, 20}');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('point');
		assertTupleExpression(mutation.value);
	});

	test('should parse mutation with list expression', () => {
		const lexer = new Lexer('mut! items = [1, 2, 3]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('items');
		assertListExpression(mutation.value);
	});

	test('should parse mutation with function application', () => {
		const lexer = new Lexer('mut! result = add 1 2');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('result');
		assertApplicationExpression(mutation.value);
	});

	test('should parse mutation with accessor expression', () => {
		const lexer = new Lexer('mut! name = @name person');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('name');
		assertApplicationExpression(mutation.value);
	});

	test('should parse mutation with match expression', () => {
		const lexer = new Lexer(
			'mut! result = match x with (Some y => y; None => 0)'
		);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('result');
		assertMatchExpression(mutation.value);
	});

	test('should parse mutation with where expression', () => {
		const lexer = new Lexer(
			'mut! result = value where (x = 1; y = 2; value = x + y)'
		);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('result');
		assertWhereExpression(mutation.value);
	});

	test('should parse multiple mutations in sequence', () => {
		const lexer = new Lexer('mut x = 1; mut! x = 2; mut! x = 3');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		// The parser combines statements with semicolons into binary expressions
		expect(program.statements.length).toBe(1);
		expect(program.statements[0].kind).toBe('binary');
	});

	test('should parse mutation with complex nested expressions', () => {
		const lexer = new Lexer('mut! result = if x > 0 then 1 else 0');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements.length).toBe(1);
		const mutation = program.statements[0];
		assertMutationExpression(mutation);
		expect(mutation.target).toBe('result');
		assertIfExpression(mutation.value);
	});
});
