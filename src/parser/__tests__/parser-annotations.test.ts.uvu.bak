import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import type { 
	ParseResult, 
	ParseSuccess, 
	ParseError,
	BinaryExpression,
	DefinitionExpression,
	TypedExpression
} from '../../ast';

// Helper functions for type-safe testing
function assertParseSuccess<T>(result: ParseResult<T>): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

function assertParseError<T>(result: ParseResult<T>): asserts result is ParseError {
	if (result.success) {
		throw new Error(`Expected parse error, got success: (${JSON.stringify(result)})`);
	}
}

function assertRecordType(type: any): void {
	if (type.kind !== 'record') {
		throw new Error(`Expected record type, got ${type.kind}`);
	}
}

function assertTupleType(type: any): void {
	if (type.kind !== 'tuple') {
		throw new Error(`Expected tuple type, got ${type.kind}`);
	}
}

function assertListType(type: any): void {
	if (type.kind !== 'list') {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}

function assertFunctionType(type: any): void {
	if (type.kind !== 'function') {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}

function assertVariableType(type: any): void {
	if (type.kind !== 'variable') {
		throw new Error(`Expected variable type, got ${type.kind}`);
	}
}

function assertBinaryExpression(expr: any): BinaryExpression {
	if (expr.kind !== 'binary') {
		throw new Error(`Expected binary expression, got ${expr.kind}`);
	}
	return expr;
}

function assertDefinitionExpression(expr: any): DefinitionExpression {
	if (expr.kind !== 'definition') {
		throw new Error(`Expected definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertTypedExpression(expr: any): TypedExpression {
	if (expr.kind !== 'typed') {
		throw new Error(`Expected typed expression, got ${expr.kind}`);
	}
	return expr;
}

function assertFunctionExpression(expr: any): any {
	if (expr.kind !== 'function') {
		throw new Error(`Expected function expression, got ${expr.kind}`);
	}
	return expr;
}

function parseType(typeSrc: string) {
	const lexer = new Lexer(typeSrc);
	const tokens = lexer.tokenize();
	return parseTypeExpression(tokens);
}

function parseDefinition(defSrc: string) {
	const lexer = new Lexer(defSrc);
	const tokens = lexer.tokenize();
	return parse(tokens);
}

test('Top-level sequence parsing - multiple definitions and final expression', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const seq = program.statements[0];
	assert.is(seq.kind, 'binary'); // semicolon sequence
});

test('Top-level sequence parsing - multiple definitions and final record', () => {
	const code = `
      sum = fn x y => x + y;
      sub = fn x y => x - y;
      math = { @add sum, @sub sub };
      math
    `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const seq = program.statements[0];
	assert.is(seq.kind, 'binary');
});

test('Top-level sequence parsing - sequence with trailing semicolon', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b;');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const seq = program.statements[0];
	assert.is(seq.kind, 'binary');
});

test('Type annotation parsing - parses record type annotation', () => {
	const result = parseType('{ name: String, age: Float }');
	assertParseSuccess(result);
	assertRecordType(result.value);
	assert.is(result.value.kind, 'record');
	assert.ok(result.value.fields.hasOwnProperty('name'));
	assert.ok(result.value.fields.hasOwnProperty('age'));
	assert.is(result.value.fields.name.kind, 'primitive');
	assert.is(result.value.fields.age.kind, 'primitive');
});

test('Type annotation parsing - parses tuple type annotation', () => {
	const result = parseType('{ Float, String }');
	assertParseSuccess(result);
	assertTupleType(result.value);
	assert.is(result.value.elements[0].kind, 'primitive');
	assert.is(result.value.elements[1].kind, 'primitive');
});

test('Type annotation parsing - parses list type annotation', () => {
	const result = parseType('List Float');
	assertParseSuccess(result);
	assertListType(result.value);
	assert.is(result.value.element.kind, 'primitive');
});

test('Type annotation parsing - parses function type annotation', () => {
	const result = parseType('Float -> Float');
	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	assert.is(funcType.params[0].kind, 'primitive');
	assert.is(funcType.return.kind, 'primitive');
});

test('Type annotation parsing - parses type variable', () => {
	const result = parseType('a');
	assertParseSuccess(result);
	assertVariableType(result.value);
	assert.is(result.value.kind, 'variable');
	assert.is(result.value.name, 'a');
});

test('Type annotation parsing - parses simple type constructor application', () => {
	const result = parseType('Option Float');
	assertParseSuccess(result);
	assert.is(result.value.kind, 'variant');
	const variantType = result.value as any;
	assert.is(variantType.name, 'Option');
	assert.is(variantType.args.length, 1);
	assert.is(variantType.args[0].kind, 'primitive');
	assert.is(variantType.args[0].name, 'Float');
});

test('Type annotation parsing - parses type constructor with type variable', () => {
	const result = parseType('Option a');
	assertParseSuccess(result);
	assert.is(result.value.kind, 'variant');
	const variantType = result.value as any;
	assert.is(variantType.name, 'Option');
	assert.is(variantType.args.length, 1);
	assert.is(variantType.args[0].kind, 'variable');
	assert.is(variantType.args[0].name, 'a');
});

test('Type annotation parsing - parses type constructor with multiple arguments', () => {
	const result = parseType('Either String Float');
	assertParseSuccess(result);
	assert.is(result.value.kind, 'variant');
	const variantType = result.value as any;
	assert.is(variantType.name, 'Either');
	assert.is(variantType.args.length, 2);
	assert.is(variantType.args[0].kind, 'primitive');
	assert.is(variantType.args[0].name, 'String');
	assert.is(variantType.args[1].kind, 'primitive');
	assert.is(variantType.args[1].name, 'Float');
});

test('Type annotation parsing - parses nested type constructor application', () => {
	const result = parseType('Option (Either String Float)');
	assertParseSuccess(result);
	assert.is(result.value.kind, 'variant');
	const variantType = result.value as any;
	assert.is(variantType.name, 'Option');
	assert.is(variantType.args.length, 1);
	assert.is(variantType.args[0].kind, 'variant');
	assert.is(variantType.args[0].name, 'Either');
	assert.is(variantType.args[0].args.length, 2);
});

test('Effect parsing - should parse function type with single effect', () => {
	const lexer = new Lexer('Float -> Float !write');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	assert.equal([...funcType.effects], ['write']);
	assert.is(funcType.params.length, 1);
	assert.is(funcType.params[0].kind, 'primitive');
	assert.is(funcType.return.kind, 'primitive');
});

test('Effect parsing - should parse function type with multiple effects', () => {
	const lexer = new Lexer('Float -> String !write !log');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	assert.equal([...funcType.effects].sort(), ['log', 'write']);
});

test('Effect parsing - should parse function type with all valid effects', () => {
	const lexer = new Lexer(
		'Float -> Float !log !read !write !state !time !rand !ffi !async'
	);
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	assert.equal([...funcType.effects].sort(), [
		'async',
		'ffi',
		'log',
		'rand',
		'read',
		'state',
		'time',
		'write',
	]);
});

test('Effect parsing - should parse function type with no effects', () => {
	const lexer = new Lexer('Float -> Float');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	assert.equal([...funcType.effects], []);
});

test('Effect parsing - should reject invalid effect names', () => {
	const lexer = new Lexer('Float -> Float !invalid');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseError(result);
	assert.ok(result.error.includes('Invalid effect: invalid'));
});

test('Effect parsing - should require effect name after exclamation mark', () => {
	const lexer = new Lexer('Float -> Float !');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseError(result);
	assert.ok(result.error.includes('Expected effect name after !'));
});

test('Top-level definitions with type annotations - parses definition with function type annotation', () => {
	const result = parseDefinition(
		'sum = fn x y => x + y : Float -> Float -> Float;'
	);
	assert.is(result.statements.length, 1);
	assert.is(result.statements[0].kind, 'definition');
	const def = assertDefinitionExpression(result.statements[0]);
	assert.is(def.name, 'sum');
	assert.is(def.value.kind, 'function');
});

test('Top-level definitions with type annotations - parses definition with primitive type annotation', () => {
	const result = parseDefinition('answer = 42 : Float;');
	assert.is(result.statements.length, 1);
	assert.is(result.statements[0].kind, 'definition');
	const def = assertDefinitionExpression(result.statements[0]);
	assert.is(def.name, 'answer');
	const typed = assertTypedExpression(def.value);
	assert.is(typed.expression.kind, 'literal');
	assert.is(typed.type.kind, 'primitive');
});

test('Top-level definitions with type annotations - parses definition with list type annotation', () => {
	const result = parseDefinition('numbers = [1, 2, 3] : List Float;');
	assert.is(result.statements.length, 1);
	const def = assertDefinitionExpression(result.statements[0]);
	assert.is(def.name, 'numbers');
	const typed = assertTypedExpression(def.value);
	assert.is(typed.expression.kind, 'list');
	assert.is(typed.type.kind, 'list'); // List types have kind "list"
	assert.is((typed.type as any).element.kind, 'primitive'); // Float is a primitive type
	assert.is((typed.type as any).element.name, 'Float');
});

test.run();