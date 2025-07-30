import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import type {
	Expression,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	BinaryExpression,
	Type,
	RecordType,
	TupleType,
	ListType,
	FunctionType,
	VariableType,
	DefinitionExpression,
	TypedExpression,
	MatchExpression,
	TypeDefinitionExpression,
	WhereExpression,
	MutableDefinitionExpression,
	MutationExpression,
	ConstraintDefinitionExpression,
	ImplementDefinitionExpression,
	UnitExpression,
	ConstrainedExpression,
} from '../../ast';
import type { ParseError, ParseResult, ParseSuccess } from '../combinators';
import { describe, test, expect } from 'bun:test';

// Helper functions for type-safe testing
function assertLiteralExpression(expr: Expression): LiteralExpression {
	if (expr.kind !== 'literal') {
		throw new Error(`Expected literal expression, got ${expr.kind}`);
	}
	return expr;
}

function assertVariableExpression(expr: Expression): VariableExpression {
	if (expr.kind !== 'variable') {
		throw new Error(`Expected variable expression, got ${expr.kind}`);
	}
	return expr;
}

function assertFunctionExpression(expr: Expression): FunctionExpression {
	if (expr.kind !== 'function') {
		throw new Error(`Expected function expression, got ${expr.kind}`);
	}
	return expr;
}

function assertApplicationExpression(expr: Expression): ApplicationExpression {
	if (expr.kind !== 'application') {
		throw new Error(`Expected application expression, got ${expr.kind}`);
	}
	return expr;
}

function assertBinaryExpression(expr: Expression): BinaryExpression {
	if (expr.kind !== 'binary') {
		throw new Error(`Expected binary expression, got ${expr.kind}`);
	}
	return expr;
}

function assertUnitExpression(expr: Expression): UnitExpression {
	if (expr.kind !== 'unit') {
		throw new Error(`Expected unit expression, got ${expr.kind}`);
	}
	return expr;
}

function assertTypeDefinitionExpression(
	expr: Expression
): TypeDefinitionExpression {
	if (expr.kind !== 'type-definition') {
		throw new Error(`Expected type definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertWhereExpression(expr: Expression): WhereExpression {
	if (expr.kind !== 'where') {
		throw new Error(`Expected where expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMutableDefinitionExpression(
	expr: Expression
): MutableDefinitionExpression {
	if (expr.kind !== 'mutable-definition') {
		throw new Error(`Expected mutable definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMutationExpression(expr: Expression): MutationExpression {
	if (expr.kind !== 'mutation') {
		throw new Error(`Expected mutation expression, got ${expr.kind}`);
	}
	return expr;
}

function assertConstraintDefinitionExpression(
	expr: Expression
): ConstraintDefinitionExpression {
	if (expr.kind !== 'constraint-definition') {
		throw new Error(
			`Expected constraint definition expression, got ${expr.kind}`
		);
	}
	return expr;
}

function assertImplementDefinitionExpression(
	expr: Expression
): ImplementDefinitionExpression {
	if (expr.kind !== 'implement-definition') {
		throw new Error(
			`Expected implement definition expression, got ${expr.kind}`
		);
	}
	return expr;
}

function assertConstrainedExpression(expr: Expression): ConstrainedExpression {
	if (expr.kind !== 'constrained') {
		throw new Error(`Expected constrained expression, got ${expr.kind}`);
	}
	return expr;
}

function assertRecordType(type: Type): asserts type is RecordType {
	if (type.kind !== 'record') {
		throw new Error(`Expected record type, got ${type.kind}`);
	}
}

function assertTupleType(type: Type): asserts type is TupleType {
	if (type.kind !== 'tuple') {
		throw new Error(`Expected tuple type, got ${type.kind}`);
	}
}

function assertListType(type: Type): asserts type is ListType {
	if (type.kind !== 'list') {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}

function assertFunctionType(type: Type): asserts type is FunctionType {
	if (type.kind !== 'function') {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}

function assertVariableType(type: Type): asserts type is VariableType {
	if (type.kind !== 'variable') {
		throw new Error(`Expected variable type, got ${type.kind}`);
	}
}

function assertDefinitionExpression(expr: Expression): DefinitionExpression {
	if (expr.kind !== 'definition') {
		throw new Error(`Expected definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertTypedExpression(expr: Expression): TypedExpression {
	if (expr.kind !== 'typed') {
		throw new Error(`Expected typed expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMatchExpression(expr: Expression): MatchExpression {
	if (expr.kind !== 'match') {
		throw new Error(`Expected match expression, got ${expr.kind}`);
	}
	return expr;
}

function assertParseSuccess<T>(
	result: ParseResult<T>
): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

function assertParseError<T>(
	result: ParseResult<T>
): asserts result is ParseError {
	if (result.success) {
		throw new Error(
			`Expected parse error, got success: (${JSON.stringify(result)})`
		);
	}
}

test('Parser - should parse simple literals', () => {
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const literal = assertLiteralExpression(program.statements[0]);
	expect(literal.value).toBe(42);
});

test('Parser - should parse string literals', () => {
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const literal = assertLiteralExpression(program.statements[0]);
	expect(literal.value).toBe('hello');
});

test('Parser - should parse boolean literals', () => {
	const lexer = new Lexer('True');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('variable');
	expect((program.statements[0] as any).name).toBe('True');
});

test('Parser - should parse variable references', () => {
	const lexer = new Lexer('x');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const variable = assertVariableExpression(program.statements[0]);
	expect(variable.name).toBe('x');
});

test('Parser - should parse function definitions', () => {
	const lexer = new Lexer('fn x => x + 1');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const func = assertFunctionExpression(program.statements[0]);
	expect(func.params).toEqual(['x']);
	expect(func.body.kind).toBe('binary');
});

test('Parser - should parse function applications', () => {
	const lexer = new Lexer('(fn x => x + 1) 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const app = assertApplicationExpression(program.statements[0]);
	expect(app.func.kind).toBe('function');
	expect(app.args.length).toBe(1);
	const arg = assertLiteralExpression(app.args[0]);
	expect(arg.value).toBe(2);
});

test('Parser - should parse binary expressions', () => {
	const lexer = new Lexer('2 + 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const binary = assertBinaryExpression(program.statements[0]);
	expect(binary.operator).toBe('+');
});

test('Parser - should parse lists', () => {
	const lexer = new Lexer('[1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('list');
	const elements = (program.statements[0] as any).elements;
	expect(Array.isArray(elements).toBeTruthy();
	expect(elements.length).toBe(3);
	expect(elements[0].kind).toBe('literal');
	expect(elements[0].value).toBe(1);
	expect(elements[1].kind).toBe('literal');
	expect(elements[1].value).toBe(2);
	expect(elements[2].kind).toBe('literal');
	expect(elements[2].value).toBe(3);
});

test('Parser - should parse if expressions', () => {
	const lexer = new Lexer('if True then 1 else 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('if');
	const ifExpr = program.statements[0] as any;
	expect(ifExpr.condition.name).toBe('True');
	expect(ifExpr.then.value).toBe(1);
	expect(ifExpr.else.value).toBe(2);
});

test('Parser - should parse pipeline expressions', () => {
	const lexer = new Lexer('[1, 2, 3] |> map');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const pipeline = program.statements[0] as any;
	expect(pipeline.kind).toBe('pipeline');
	expect(pipeline.steps[0].kind).toBe('list');
	expect(pipeline.steps[1].kind).toBe('variable');
});

test('Parser - should parse single-field record', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('record');
	const record = program.statements[0] as any;
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	expect(record.fields[0].value.value).toBe('Alice');
	expect(record.fields[1].name).toBe('age');
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse multi-field record (semicolon separated)', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('record');
	const record = program.statements[0] as any;
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	expect(record.fields[0].value.value).toBe('Alice');
	expect(record.fields[1].name).toBe('age');
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse multi-field record (semicolon separated) 2', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('record');
	const record = program.statements[0] as any;
	expect(record.fields.length).toBe(2);
	expect(record.fields[0].name).toBe('name');
	expect(record.fields[0].value.value).toBe('Alice');
	expect(record.fields[1].name).toBe('age');
	expect(record.fields[1].value.value).toBe(30);
});

test('Parser - should parse accessor', () => {
	const lexer = new Lexer('@name');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('accessor');
	const accessor = program.statements[0] as any;
	expect(accessor.field).toBe('name');
});

test('Parser - should parse function with unit parameter', () => {
	const lexer = new Lexer('fn {} => 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = assertFunctionExpression(program.statements[0]);
	expect(func.params).toEqual(['_unit']); // Unit parameter
	expect(func.body.kind).toBe('literal');
	expect((func.body as LiteralExpression).value).toBe(42);
});

test('Parser - should parse deeply nested tuples in records', () => {
	const lexer = new Lexer('{ @key [1, {{{1}}}] }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	// Check the outermost record
	expect(program.statements.length).toBe(1);
	const outer = program.statements[0];
	expect(outer.kind).toBe('record');
	const keyField = (outer as any).fields[0];
	expect(keyField.name).toBe('key');
	// Check that keyField.value is a list with two elements
	expect(keyField.value.kind).toBe('list');
	expect(keyField.value.elements.length).toBe(2);
	// First element should be a literal
	expect(keyField.value.elements[0].kind).toBe('literal');
	expect(keyField.value.elements[0].value).toBe(1);
	// Second element should be a nested tuple structure
	let nestedTuple = keyField.value.elements[1];
	expect(nestedTuple.kind).toBe('tuple');
	// Check the nested structure: tuple -> tuple -> tuple -> literal
	for (let i = 0; i < 3; i++) {
		expect(nestedTuple.kind).toBe('tuple');
		expect(nestedTuple.elements.length).toBe(1);
		nestedTuple = nestedTuple.elements[0];
	}
	expect(nestedTuple.kind).toBe('literal');
	expect(nestedTuple.value).toBe(1);
});

test('Parser - should parse records with nested lists and records', () => {
	const lexer = new Lexer('{ @key [1, { @inner [2, 3] }] }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const outer = program.statements[0];
	expect(outer.kind).toBe('record');
	const keyField = (outer as any).fields[0];
	expect(keyField.name).toBe('key');
	const list = keyField.value as any;
	expect(list.kind).toBe('list');
	expect(list.elements[0].kind).toBe('literal');
	expect(list.elements[0].value).toBe(1);
	const nestedRecord = list.elements[1];
	expect(nestedRecord.kind).toBe('record');
	const innerField = nestedRecord.fields[0];
	expect(innerField.name).toBe('inner');
	const innerList = innerField.value as any;
	expect(innerList.kind).toBe('list');
	expect(innerList.elements.map((e: any) => e.value)).toEqual([2, 3]);
});

test('Parser - should parse lists of records', () => {
	const lexer = new Lexer('[{ @a 1 }, { @b 2 }]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0] as any;
	expect(list.kind).toBe('list');
	expect(list.elements[0].kind).toBe('record');
	expect(list.elements[1].kind).toBe('record');
	expect(list.elements[0].fields[0].name).toBe('a');
	expect(list.elements[0].fields[0].value.value).toBe(1);
	expect(list.elements[1].fields[0].name).toBe('b');
	expect(list.elements[1].fields[0].value.value).toBe(2);
});

test('Parser - should parse a single tuple', () => {
	const lexer = new Lexer('{1}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const tuple = program.statements[0] as any;
	expect(tuple.kind).toBe('tuple');
	expect(tuple.elements[0].kind).toBe('literal');
	expect(tuple.elements[0].value).toBe(1);
});

test('Parser - should parse a single record', () => {
	const lexer = new Lexer('{ @foo 1 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const record = program.statements[0] as any;
	expect(record.kind).toBe('record');
	expect(record.fields[0].name).toBe('foo');
	expect(record.fields[0].value.value).toBe(1);
});

test('Parser - should parse a list of literals', () => {
	const lexer = new Lexer('[1, 2]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0] as any;
	expect(list.kind).toBe('list');
	expect(list.elements[0].kind).toBe('literal');
	expect(list.elements[0].value).toBe(1);
	expect(list.elements[1].kind).toBe('literal');
	expect(list.elements[1].value).toBe(2);
});

test('Parser - should parse a list of tuples', () => {
	const lexer = new Lexer('[{1}, {2}]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0] as any;
	expect(list.kind).toBe('list');
	expect(list.elements[0].kind).toBe('tuple');
	expect(list.elements[0].elements[0].value).toBe(1);
	expect(list.elements[1].kind).toBe('tuple');
	expect(list.elements[1].elements[0].value).toBe(2);
});

test('Parser - should parse a list of records', () => {
	const lexer = new Lexer('[{ @foo 1 }, { @bar 2 }]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const list = program.statements[0] as any;
	expect(list.kind).toBe('list');
	expect(list.elements[0].kind).toBe('record');
	expect(list.elements[0].fields[0].name).toBe('foo');
	expect(list.elements[0].fields[0].value.value).toBe(1);
	expect(list.elements[1].kind).toBe('record');
	expect(list.elements[1].fields[0].name).toBe('bar');
	expect(list.elements[1].fields[0].value.value).toBe(2);
});

test('Parser - should parse thrush operator', () => {
	const lexer = new Lexer('10 | (fn x => x + 1)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const thrush = program.statements[0] as any;
	expect(thrush.kind).toBe('binary');
	expect(thrush.operator).toBe('|');
	expect(thrush.left.kind).toBe('literal');
	expect(thrush.right.kind).toBe('function');
});

test('Parser - should parse chained thrush operators as left-associative', () => {
	const lexer = new Lexer('a | b | c');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const chain = program.statements[0] as any;
	expect(chain.kind).toBe('binary');
	expect(chain.operator).toBe('|');
	expect(chain.left.kind).toBe('binary');
	expect(chain.left.operator).toBe('|');
	expect(chain.left.left.kind).toBe('variable');
	expect(chain.left.left.name).toBe('a');
	expect(chain.left.right.kind).toBe('variable');
	expect(chain.left.right.name).toBe('b');
	expect(chain.right.kind).toBe('variable');
	expect(chain.right.name).toBe('c');
});

test('Parser - should parse thrush operator after record', () => {
	const lexer = new Lexer('{@key 1, @key2 False} | @key');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);

	// Verify it's a binary expression with thrush operator
	const expr = program.statements[0] as BinaryExpression;
	expect(expr.kind).toBe('binary');
	expect(expr.operator).toBe('|');
	expect(expr.left.kind).toBe('record');
	expect(expr.right.kind).toBe('accessor');
});

test('Parser - should parse empty braces as unit', () => {
	const lexer = new Lexer('{}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const unit = assertUnitExpression(program.statements[0]);
	expect(unit.kind).toBe('unit');
});

test('Parser - should parse function with empty parentheses', () => {
	const lexer = new Lexer('fn () => 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = assertFunctionExpression(program.statements[0]);
	expect(func.params).toEqual([]);
	expect(func.body.kind).toBe('literal');
});

test('Parser - should parse function with multiple parameters', () => {
	const lexer = new Lexer('fn x y z => x + y + z');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const func = assertFunctionExpression(program.statements[0]);
	expect(func.params).toEqual(['x', 'y', 'z']);
	expect(func.body.kind).toBe('binary');
});

test('Parser - should parse empty list', () => {
	const lexer = new Lexer('[]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('list');
	const list = program.statements[0] as any;
	expect(list.elements.length).toBe(0);
});

test('Parser - should parse list with trailing comma', () => {
	const lexer = new Lexer('[1, 2, 3,]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('list');
	const list = program.statements[0] as any;
	expect(list.elements.length).toBe(3);
});

test('Parser - should parse record with trailing comma', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30, }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('record');
	const record = program.statements[0] as any;
	expect(record.fields.length).toBe(2);
});

test('Parser - should parse unary minus (adjacent)', () => {
	const lexer = new Lexer('-42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
	const binary = program.statements[0] as any;
	expect(binary.operator).toBe('*');
	expect(binary.left.kind).toBe('literal');
	expect(binary.left.value).toBe(-1);
	expect(binary.right.kind).toBe('literal');
	expect(binary.right.value).toBe(42);
});

test('Parser - should parse minus operator (non-adjacent)', () => {
	const lexer = new Lexer('10 - 5');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	expect(program.statements[0].kind).toBe('binary');
	const binary = program.statements[0] as any;
	expect(binary.operator).toBe('-');
	expect(binary.left.kind).toBe('literal');
	expect(binary.left.value).toBe(10);
	expect(binary.right.kind).toBe('literal');
	expect(binary.right.value).toBe(5);
});

