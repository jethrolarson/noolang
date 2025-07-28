import { test } from 'uvu';
import * as assert from 'uvu/assert';
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

		assert.is(program.statements.length, 1);
		const literal = assertLiteralExpression(program.statements[0]);
		assert.is(literal.value, 42);
	});

	test('should parse string literals', () => {
		const lexer = new Lexer('"hello"');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		const literal = assertLiteralExpression(program.statements[0]);
		assert.is(literal.value, 'hello');
	});

	test('should parse boolean literals', () => {
		const lexer = new Lexer('True');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'variable');
		assert.is((program.statements[0] as any).name, 'True');
	});

	test('should parse variable references', () => {
		const lexer = new Lexer('x');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		const variable = assertVariableExpression(program.statements[0]);
		assert.is(variable.name, 'x');
	});

	test('should parse function definitions', () => {
		const lexer = new Lexer('fn x => x + 1');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		const func = assertFunctionExpression(program.statements[0]);
		assert.equal(func.params, ['x']);
		assert.is(func.body.kind, 'binary');
	});

	test('should parse function applications', () => {
		const lexer = new Lexer('(fn x => x + 1) 2');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		const app = assertApplicationExpression(program.statements[0]);
		assert.is(app.func.kind, 'function');
		assert.is(app.args.length, 1);
		const arg = assertLiteralExpression(app.args[0]);
		assert.is(arg.value, 2);
	});

	test('should parse binary expressions', () => {
		const lexer = new Lexer('2 + 3');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		const binary = assertBinaryExpression(program.statements[0]);
		assert.is(binary.operator, '+');
	});

	test('should parse lists', () => {
		const lexer = new Lexer('[1, 2, 3]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'list');
		const elements = (program.statements[0] as any).elements;
		assert.is(Array.isArray(elements), true);
		assert.is(elements.length, 3);
		assert.is(elements[0].kind, 'literal');
		assert.is(elements[0].value, 1);
		assert.is(elements[1].kind, 'literal');
		assert.is(elements[1].value, 2);
		assert.is(elements[2].kind, 'literal');
		assert.is(elements[2].value, 3);
	});

	test('should parse if expressions', () => {
		const lexer = new Lexer('if True then 1 else 2');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'if');
		const ifExpr = program.statements[0] as any;
		assert.is(ifExpr.condition.name, 'True');
		assert.is(ifExpr.then.value, 1);
		assert.is(ifExpr.else.value, 2);
	});

	test('should parse pipeline expressions', () => {
		const lexer = new Lexer('[1, 2, 3] |> map');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const pipeline = program.statements[0] as any;
		assert.is(pipeline.kind, 'pipeline');
		assert.is(pipeline.steps[0].kind, 'list');
		assert.is(pipeline.steps[1].kind, 'variable');
	});

	test('should parse single-field record', () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'record');
		const record = program.statements[0] as any;
		assert.is(record.fields.length, 2);
		assert.is(record.fields[0].name, 'name');
		assert.is(record.fields[0].value.value, 'Alice');
		assert.is(record.fields[1].name, 'age');
		assert.is(record.fields[1].value.value, 30);
	});

	test('should parse multi-field record (semicolon separated)', () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'record');
		const record = program.statements[0] as any;
		assert.is(record.fields.length, 2);
		assert.is(record.fields[0].name, 'name');
		assert.is(record.fields[0].value.value, 'Alice');
		assert.is(record.fields[1].name, 'age');
		assert.is(record.fields[1].value.value, 30);
	});

	test('should parse multi-field record (semicolon separated)', () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'record');
		const record = program.statements[0] as any;
		assert.is(record.fields.length, 2);
		assert.is(record.fields[0].name, 'name');
		assert.is(record.fields[0].value.value, 'Alice');
		assert.is(record.fields[1].name, 'age');
		assert.is(record.fields[1].value.value, 30);
	});

	test('should parse accessor', () => {
		const lexer = new Lexer('@name');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'accessor');
		const accessor = program.statements[0] as any;
		assert.is(accessor.field, 'name');
	});

	test('should parse function with unit parameter', () => {
		const lexer = new Lexer('fn {} => 42');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const func = assertFunctionExpression(program.statements[0]);
		assert.equal(func.params, ['_unit']); // Unit parameter
		assert.is(func.body.kind, 'literal');
		assert.is((func.body as LiteralExpression).value, 42);
	});

	test('should parse deeply nested tuples in records', () => {
		const lexer = new Lexer('{ @key [1, {{{1}}}] }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		// Check the outermost record
		assert.is(program.statements.length, 1);
		const outer = program.statements[0];
		assert.is(outer.kind, 'record');
		const keyField = (outer as any).fields[0];
		assert.is(keyField.name, 'key');
		// Check that keyField.value is a list with two elements
		assert.is(keyField.value.kind, 'list');
		assert.is(keyField.value.elements.length, 2);
		// First element should be a literal
		assert.is(keyField.value.elements[0].kind, 'literal');
		assert.is(keyField.value.elements[0].value, 1);
		// Second element should be a nested tuple structure
		let nestedTuple = keyField.value.elements[1];
		assert.is(nestedTuple.kind, 'tuple');
		// Check the nested structure: tuple -> tuple -> tuple -> literal
		for (let i = 0; i < 3; i++) {
			assert.is(nestedTuple.kind, 'tuple');
			assert.is(nestedTuple.elements.length, 1);
			nestedTuple = nestedTuple.elements[0];
		}
		assert.is(nestedTuple.kind, 'literal');
		assert.is(nestedTuple.value, 1);
	});

	test('should parse records with nested lists and records', () => {
		const lexer = new Lexer('{ @key [1, { @inner [2, 3] }] }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const outer = program.statements[0];
		assert.is(outer.kind, 'record');
		const keyField = (outer as any).fields[0];
		assert.is(keyField.name, 'key');
		const list = keyField.value as any;
		assert.is(list.kind, 'list');
		assert.is(list.elements[0].kind, 'literal');
		assert.is(list.elements[0].value, 1);
		const nestedRecord = list.elements[1];
		assert.is(nestedRecord.kind, 'record');
		const innerField = nestedRecord.fields[0];
		assert.is(innerField.name, 'inner');
		const innerList = innerField.value as any;
		assert.is(innerList.kind, 'list');
		assert.equal(innerList.elements.map((e: any) => e.value), [2, 3]);
	});

	test('should parse lists of records', () => {
		const lexer = new Lexer('[{ @a 1 }, { @b 2 }]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const list = program.statements[0] as any;
		assert.is(list.kind, 'list');
		assert.is(list.elements[0].kind, 'record');
		assert.is(list.elements[1].kind, 'record');
		assert.is(list.elements[0].fields[0].name, 'a');
		assert.is(list.elements[0].fields[0].value.value, 1);
		assert.is(list.elements[1].fields[0].name, 'b');
		assert.is(list.elements[1].fields[0].value.value, 2);
	});

	test('should parse a single tuple', () => {
		const lexer = new Lexer('{1}');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const tuple = program.statements[0] as any;
		assert.is(tuple.kind, 'tuple');
		assert.is(tuple.elements[0].kind, 'literal');
		assert.is(tuple.elements[0].value, 1);
	});

	test('should parse a single record', () => {
		const lexer = new Lexer('{ @foo 1 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const record = program.statements[0] as any;
		assert.is(record.kind, 'record');
		assert.is(record.fields[0].name, 'foo');
		assert.is(record.fields[0].value.value, 1);
	});

	test('should parse a list of literals', () => {
		const lexer = new Lexer('[1, 2]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const list = program.statements[0] as any;
		assert.is(list.kind, 'list');
		assert.is(list.elements[0].kind, 'literal');
		assert.is(list.elements[0].value, 1);
		assert.is(list.elements[1].kind, 'literal');
		assert.is(list.elements[1].value, 2);
	});

	test('should parse a list of tuples', () => {
		const lexer = new Lexer('[{1}, {2}]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const list = program.statements[0] as any;
		assert.is(list.kind, 'list');
		assert.is(list.elements[0].kind, 'tuple');
		assert.is(list.elements[0].elements[0].value, 1);
		assert.is(list.elements[1].kind, 'tuple');
		assert.is(list.elements[1].elements[0].value, 2);
	});

	test('should parse a list of records', () => {
		const lexer = new Lexer('[{ @foo 1 }, { @bar 2 }]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const list = program.statements[0] as any;
		assert.is(list.kind, 'list');
		assert.is(list.elements[0].kind, 'record');
		assert.is(list.elements[0].fields[0].name, 'foo');
		assert.is(list.elements[0].fields[0].value.value, 1);
		assert.is(list.elements[1].kind, 'record');
		assert.is(list.elements[1].fields[0].name, 'bar');
		assert.is(list.elements[1].fields[0].value.value, 2);
	});

	test('should parse thrush operator', () => {
		const lexer = new Lexer('10 | (fn x => x + 1)');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const thrush = program.statements[0] as any;
		assert.is(thrush.kind, 'binary');
		assert.is(thrush.operator, '|');
		assert.is(thrush.left.kind, 'literal');
		assert.is(thrush.right.kind, 'function');
	});

	test('should parse chained thrush operators as left-associative', () => {
		const lexer = new Lexer('a | b | c');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const chain = program.statements[0] as any;
		assert.is(chain.kind, 'binary');
		assert.is(chain.operator, '|');
		assert.is(chain.left.kind, 'binary');
		assert.is(chain.left.operator, '|');
		assert.is(chain.left.left.kind, 'variable');
		assert.is(chain.left.left.name, 'a');
		assert.is(chain.left.right.kind, 'variable');
		assert.is(chain.left.right.name, 'b');
		assert.is(chain.right.kind, 'variable');
		assert.is(chain.right.name, 'c');
	});

	test('should parse thrush operator after record', () => {
		const lexer = new Lexer('{@key 1, @key2 False} | @key');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);

		// Verify it's a binary expression with thrush operator
		const expr = program.statements[0] as BinaryExpression;
		assert.is(expr.kind, 'binary');
		assert.is(expr.operator, '|');
		assert.is(expr.left.kind, 'record');
		assert.is(expr.right.kind, 'accessor');
	});

	// Add tests for empty unit expression
	test('should parse empty braces as unit', () => {
		const lexer = new Lexer('{}');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const unit = assertUnitExpression(program.statements[0]);
		assert.is(unit.kind, 'unit');
	});

	// Add tests for function with empty parentheses
	test('should parse function with empty parentheses', () => {
		const lexer = new Lexer('fn () => 42');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const func = assertFunctionExpression(program.statements[0]);
		assert.equal(func.params, []);
		assert.is(func.body.kind, 'literal');
	});

	// Add tests for function with multiple parameters
	test('should parse function with multiple parameters', () => {
		const lexer = new Lexer('fn x y z => x + y + z');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const func = assertFunctionExpression(program.statements[0]);
		assert.equal(func.params, ['x', 'y', 'z']);
		assert.is(func.body.kind, 'binary');
	});

	// Add tests for empty lists
	test('should parse empty list', () => {
		const lexer = new Lexer('[]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'list');
		const list = program.statements[0] as any;
		assert.is(list.elements.length, 0);
	});

	// Add tests for lists with trailing commas
	test('should parse list with trailing comma', () => {
		const lexer = new Lexer('[1, 2, 3,]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'list');
		const list = program.statements[0] as any;
		assert.is(list.elements.length, 3);
	});

	// Add tests for records with trailing commas
	test('should parse record with trailing comma', () => {
		const lexer = new Lexer('{ @name "Alice", @age 30, }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'record');
		const record = program.statements[0] as any;
		assert.is(record.fields.length, 2);
	});

	// Add tests for unary minus (adjacent)
	test('should parse unary minus (adjacent)', () => {
		const lexer = new Lexer('-42');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'binary');
		const binary = program.statements[0] as any;
		assert.is(binary.operator, '*');
		assert.is(binary.left.kind, 'literal');
		assert.is(binary.left.value, -1);
		assert.is(binary.right.kind, 'literal');
		assert.is(binary.right.value, 42);
	});

	// Add tests for minus operator (non-adjacent)
	test('should parse minus operator (non-adjacent)', () => {
		const lexer = new Lexer('10 - 5');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		assert.is(program.statements[0].kind, 'binary');
		const binary = program.statements[0] as any;
		assert.is(binary.operator, '-');
		assert.is(binary.left.kind, 'literal');
		assert.is(binary.left.value, 10);
		assert.is(binary.right.kind, 'literal');
		assert.is(binary.right.value, 5);
	});

// Type Definitions (ADTs) tests
test('Type Definitions (ADTs) - should parse simple type definition', () => {
		const lexer = new Lexer('type Bool = True | False');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const typeDef = assertTypeDefinitionExpression(program.statements[0]);
		assert.is(typeDef.name, 'Bool');
		assert.equal(typeDef.typeParams, []);
		assert.is(typeDef.constructors.length, 2);
		assert.is(typeDef.constructors[0].name, 'True');
		assert.equal(typeDef.constructors[0].args, []);
		assert.is(typeDef.constructors[1].name, 'False');
		assert.equal(typeDef.constructors[1].args, []);
	});

	test('should parse type definition with parameters', () => {
		const lexer = new Lexer('type Option a = None | Some a');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const typeDef = assertTypeDefinitionExpression(program.statements[0]);
		assert.is(typeDef.name, 'Option');
		assert.equal(typeDef.typeParams, ['a']);
		assert.is(typeDef.constructors.length, 2);
		assert.is(typeDef.constructors[0].name, 'None');
		assert.equal(typeDef.constructors[0].args, []);
		assert.is(typeDef.constructors[1].name, 'Some');
		assert.is(typeDef.constructors[1].args.length, 1);
	});

	test('should parse type definition with complex constructors', () => {
		const lexer = new Lexer('type Either a b = Left a | Right b');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
		const typeDef = assertTypeDefinitionExpression(program.statements[0]);
		assert.is(typeDef.name, 'Either');
		assert.equal(typeDef.typeParams, ['a', 'b']);
		assert.is(typeDef.constructors.length, 2);
		assert.is(typeDef.constructors[0].name, 'Left');
		assert.is(typeDef.constructors[1].name, 'Right');
	});

	test('should parse type definition with multiple constructor arguments', () => {
		const lexer = new Lexer('type Person = Person String Float');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		assert.is(program.statements.length, 1);
