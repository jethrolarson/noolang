import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import {
	assertApplicationExpression,
	assertBinaryExpression,
	assertIfExpression,
	assertListExpression,
	assertLiteralExpression,
	assertPipelineExpression,
	assertVariableExpression,
	assertFunctionExpression,
	assertRecordExpression,
	assertAccessorExpression,
	assertTupleExpression,
	assertUnitExpression,
} from '../../../test/utils';

test('Parser - should parse simple literals', () => {
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const literal = program.statements[0];
	assertLiteralExpression(literal);
	expect(literal.value).toBe(42);
});

test('Parser - should parse string literals', () => {
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const literal = program.statements[0];
	assertLiteralExpression(literal);
	expect(literal.value).toBe('hello');
});

test('Parser - should parse boolean literals', () => {
	const lexer = new Lexer('True');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const variable = program.statements[0];
	assertVariableExpression(variable);
	expect(variable.name).toBe('True');
});

test('Parser - should parse variable references', () => {
	const lexer = new Lexer('x');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const variable = program.statements[0];
	assertVariableExpression(variable);
	expect(variable.name).toBe('x');
});

test('Parser - should parse function definitions', () => {
	const lexer = new Lexer('fn x => x + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const func = program.statements[0];
	assertFunctionExpression(func);
	expect(func.params).toEqual(['x']);
	assertBinaryExpression(func.body);
});

test('Parser - should parse function applications', () => {
	const lexer = new Lexer('(fn x => x + 1) 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const app = program.statements[0];
	assertApplicationExpression(app);
	assertFunctionExpression(app.func);
	expect(app.args.length).toBe(1);
	const arg = app.args[0];
	assertLiteralExpression(arg);
	expect(arg.value).toBe(2);
});

test('Parser - should parse binary expressions', () => {
	const lexer = new Lexer('2 + 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const binary = program.statements[0];
	assertBinaryExpression(binary);
	expect(binary.operator).toBe('+');
});

test('Parser - should parse lists', () => {
	const lexer = new Lexer('[1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	const elements = list.elements;
	expect(Array.isArray(elements)).toBeTruthy();
	expect(elements.length).toBe(3);
	assertLiteralExpression(elements[0]);
	expect(elements[0].value).toBe(1);
	assertLiteralExpression(elements[1]);
	expect(elements[1].value).toBe(2);
	assertLiteralExpression(elements[2]);
	expect(elements[2].value).toBe(3);
});

test('Parser - should parse if expressions', () => {
	const lexer = new Lexer('if True then 1 else 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const ifExpr = program.statements[0];
	assertIfExpression(ifExpr);
	assertVariableExpression(ifExpr.condition);
	expect(ifExpr.condition.name).toBe('True');
	assertLiteralExpression(ifExpr.then);
	expect(ifExpr.then.value).toBe(1);
	assertLiteralExpression(ifExpr.else);
	expect(ifExpr.else.value).toBe(2);
});

test('Parser - should parse pipeline expressions', () => {
	const lexer = new Lexer('[1, 2, 3] |> map');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const pipeline = program.statements[0];
	assertPipelineExpression(pipeline);
	assertListExpression(pipeline.steps[0]);
	assertVariableExpression(pipeline.steps[1]);
});

test('Parser - should parse single-field record', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0];
	assertRecordExpression(record);
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	assertLiteralExpression(record.fields[0].value);
	expect(record.fields[0].value.value).toBe('Alice');
	assertLiteralExpression(record.fields[1].value);
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse multi-field record (semicolon separated)', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0];
	assertRecordExpression(record);
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	assertLiteralExpression(record.fields[0].value);
	expect(record.fields[0].value.value).toBe('Alice');
	assertLiteralExpression(record.fields[1].value);
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse multi-field record (semicolon separated) 2', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0];
	assertRecordExpression(record);
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	assertLiteralExpression(record.fields[0].value);
	expect(record.fields[0].value.value).toBe('Alice');
	assertLiteralExpression(record.fields[1].value);
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse accessor', () => {
	const lexer = new Lexer('@name');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const accessor = program.statements[0];
	assertAccessorExpression(accessor);
	expect(accessor.field).toBe('name');
});

test('Parser - should parse function with unit parameter', () => {
	const lexer = new Lexer('fn {} => 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = program.statements[0];
	assertFunctionExpression(func);
	expect(func.params).toEqual(['_unit']); // Unit parameter
	assertLiteralExpression(func.body);
	expect(func.body.value).toBe(42);
});

test('Parser - should parse deeply nested tuples in records', () => {
	const lexer = new Lexer('{ @key [1, {{{1}}}] }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// Check the outermost record
	expect(program.statements.length).toBe(1);
	const outer = program.statements[0];
	assertRecordExpression(outer);
	const keyField = outer.fields[0];
	expect(keyField.name).toBe('key');
	// Check that keyField.value is a list with two elements
	assertListExpression(keyField.value);
	expect(keyField.value.elements.length).toBe(2);
	// First element should be a literal
	assertLiteralExpression(keyField.value.elements[0]);
	expect(keyField.value.elements[0].value).toBe(1);
	// Second element should be a nested tuple structure
	let nestedTuple = keyField.value.elements[1];
	assertTupleExpression(nestedTuple);
	// Check the nested structure: tuple -> tuple -> tuple -> literal
	for (let i = 0; i < 3; i++) {
		assertTupleExpression(nestedTuple);
		expect(nestedTuple.elements.length).toBe(1);
		nestedTuple = nestedTuple.elements[0];
	}
	assertLiteralExpression(nestedTuple);
	expect(nestedTuple.value).toBe(1);
});

test('Parser - should parse records with nested lists and records', () => {
	const lexer = new Lexer('{ @key [1, { @inner [2, 3] }] }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const outer = program.statements[0];
	assertRecordExpression(outer);
	const keyField = outer.fields[0];
	expect(keyField.name).toBe('key');
	const list = keyField.value;
	assertListExpression(list);
	assertLiteralExpression(list.elements[0]);
	expect(list.elements[0].value).toBe(1);
	const nestedRecord = list.elements[1];
	assertRecordExpression(nestedRecord);
	const innerField = nestedRecord.fields[0];
	expect(innerField.name).toBe('inner');
	const innerList = innerField.value;
	assertListExpression(innerList);
	assertLiteralExpression(innerList.elements[0]);
	expect(innerList.elements[0].value).toBe(2);
	assertLiteralExpression(innerList.elements[1]);
	expect(innerList.elements[1].value).toBe(3);
});

test('Parser - should parse lists of records', () => {
	const lexer = new Lexer('[{ @a 1 }, { @b 2 }]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	assertRecordExpression(list.elements[0]);
	assertRecordExpression(list.elements[1]);
	assertLiteralExpression(list.elements[0].fields[0].value);
	expect(list.elements[0].fields[0].value.value).toBe(1);
	assertLiteralExpression(list.elements[1].fields[0].value);
	expect(list.elements[1].fields[0].value.value).toBe(2);
});

test('Parser - should parse a single tuple', () => {
	const lexer = new Lexer('{1}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const tuple = program.statements[0];
	assertTupleExpression(tuple);
	assertLiteralExpression(tuple.elements[0]);
	expect(tuple.elements[0].value).toBe(1);
});

test('Parser - should parse a single record', () => {
	const lexer = new Lexer('{ @foo 1 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0];
	assertRecordExpression(record);
	expect(record.fields[0].name).toBe('foo');
	assertLiteralExpression(record.fields[0].value);
	expect(record.fields[0].value.value).toBe(1);
});

test('Parser - should parse a list of literals', () => {
	const lexer = new Lexer('[1, 2]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	assertLiteralExpression(list.elements[0]);
	expect(list.elements[0].value).toBe(1);
	assertLiteralExpression(list.elements[1]);
	expect(list.elements[1].value).toBe(2);
});

test('Parser - should parse a list of tuples', () => {
	const lexer = new Lexer('[{1}, {2}]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	assertTupleExpression(list.elements[0]);
	assertTupleExpression(list.elements[1]);
	assertLiteralExpression(list.elements[0].elements[0]);
	expect(list.elements[0].elements[0].value).toBe(1);
	assertLiteralExpression(list.elements[1].elements[0]);
	expect(list.elements[1].elements[0].value).toBe(2);
});

test('Parser - should parse a list of records', () => {
	const lexer = new Lexer('[{ @foo 1 }, { @bar 2 }]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	assertRecordExpression(list.elements[0]);
	assertRecordExpression(list.elements[1]);
	expect(list.elements[0].fields[0].name).toBe('foo');
	assertLiteralExpression(list.elements[0].fields[0].value);
	expect(list.elements[0].fields[0].value.value).toBe(1);
	assertLiteralExpression(list.elements[1].fields[0].value);
	expect(list.elements[1].fields[0].name).toBe('bar');
	expect(list.elements[1].fields[0].value.value).toBe(2);
});

test('Parser - should parse thrush operator', () => {
	const lexer = new Lexer('10 | (fn x => x + 1)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const thrush = program.statements[0];
	assertBinaryExpression(thrush);
	expect(thrush.operator).toBe('|');
	assertFunctionExpression(thrush.right);
});

test('Parser - should parse chained thrush operators as left-associative', () => {
	const lexer = new Lexer('a | b | c');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const chain = program.statements[0];
	assertBinaryExpression(chain);
	expect(chain.operator).toBe('|');
	assertBinaryExpression(chain.left);
	expect(chain.left.operator).toBe('|');
	assertVariableExpression(chain.left.left);
	expect(chain.left.left.name).toBe('a');
	assertVariableExpression(chain.left.right);
	expect(chain.left.right.name).toBe('b');
	assertVariableExpression(chain.right);
	expect(chain.right.name).toBe('c');
});

test('Parser - should parse thrush operator after record', () => {
	const lexer = new Lexer('{@key 1, @key2 False} | @key');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);

	// Verify it's a binary expression with thrush operator
	const expr = program.statements[0];
	assertBinaryExpression(expr);
	expect(expr.operator).toBe('|');
	assertRecordExpression(expr.left);
	assertAccessorExpression(expr.right);
});

test('Parser - should parse empty braces as unit', () => {
	const lexer = new Lexer('{}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const unit = program.statements[0];
	assertUnitExpression(unit);
});

test('Parser - should parse function with empty parentheses', () => {
	const lexer = new Lexer('fn () => 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = program.statements[0];
	assertFunctionExpression(func);
	expect(func.params).toEqual([]);
	assertLiteralExpression(func.body);
});

test('Parser - should parse function with multiple parameters', () => {
	const lexer = new Lexer('fn x y z => x + y + z');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = program.statements[0];
	assertFunctionExpression(func);
	expect(func.params).toEqual(['x', 'y', 'z']);
	assertBinaryExpression(func.body);
});

test('Parser - should parse empty list', () => {
	const lexer = new Lexer('[]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	expect(list.elements.length).toBe(0);
});

test('Parser - should parse list with trailing comma', () => {
	const lexer = new Lexer('[1, 2, 3,]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0];
	assertListExpression(list);
	expect(list.elements.length).toBe(3);
});

test('Parser - should parse record with trailing comma', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30, }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0];
	assertRecordExpression(record);
	expect(record.fields.length).toBe(2);
});

test('Parser - should parse unary minus (adjacent)', () => {
	const lexer = new Lexer('-42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const binary = program.statements[0];
	assertBinaryExpression(binary);
	expect(binary.operator).toBe('*');
	assertLiteralExpression(binary.left);
	expect(binary.left.value).toBe(-1);
	assertLiteralExpression(binary.right);
	expect(binary.right.value).toBe(42);
});

test('Parser - should parse minus operator (non-adjacent)', () => {
	const lexer = new Lexer('10 - 5');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const binary = program.statements[0];
	assertBinaryExpression(binary);
	expect(binary.operator).toBe('-');
	assertLiteralExpression(binary.left);
	expect(binary.left.value).toBe(10);
	assertLiteralExpression(binary.right);
	expect(binary.right.value).toBe(5);
});

