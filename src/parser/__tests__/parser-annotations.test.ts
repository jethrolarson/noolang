import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import { test, expect } from 'bun:test';
import type { ParseResult, ParseSuccess, ParseError } from '../../parser/combinators';
import type { 
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
	expect(program.statements.length).toBe(1);
	const seq = program.statements[0];
	expect(seq.kind).toBe('binary'); // semicolon sequence
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
	expect(program.statements.length).toBe(1);
	const seq = program.statements[0];
	expect(seq.kind).toBe('binary');
});

test('Top-level sequence parsing - sequence with trailing semicolon', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b;');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const seq = program.statements[0];
	expect(seq.kind).toBe('binary');
});

test('Type annotation parsing - parses record type annotation', () => {
	const result = parseType('{ name: String, age: Float }');
	assertParseSuccess(result);
	assertRecordType(result.value);
	expect(result.value.kind).toBe('record');
	expect(result.value.fields.hasOwnProperty('name')).toBeTruthy();
	expect(result.value.fields.hasOwnProperty('age')).toBeTruthy();
	expect(result.value.fields.name.kind).toBe('primitive');
	expect(result.value.fields.age.kind).toBe('primitive');
});

test('Type annotation parsing - parses tuple type annotation', () => {
	const result = parseType('{ Float, String }');
	assertParseSuccess(result);
	assertTupleType(result.value);
	expect(result.value.elements[0].kind).toBe('primitive');
	expect(result.value.elements[1].kind).toBe('primitive');
});

test('Type annotation parsing - parses list type annotation', () => {
	const result = parseType('List Float');
	assertParseSuccess(result);
	assertListType(result.value);
	expect(result.value.element.kind).toBe('primitive');
});

test('Type annotation parsing - parses function type annotation', () => {
	const result = parseType('Float -> Float');
	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	expect(funcType.params[0].kind).toBe('primitive');
	expect(funcType.return.kind).toBe('primitive');
});

test('Type annotation parsing - parses type variable', () => {
	const result = parseType('a');
	assertParseSuccess(result);
	assertVariableType(result.value);
	expect(result.value.kind).toBe('variable');
	expect(result.value.name).toBe('a');
});

test('Type annotation parsing - parses simple type constructor application', () => {
	const result = parseType('Option Float');
	assertParseSuccess(result);
	expect(result.value.kind).toBe('variant');
	const variantType = result.value as any;
	expect(variantType.name).toBe('Option');
	expect(variantType.args.length).toBe(1);
	expect(variantType.args[0].kind).toBe('primitive');
	expect(variantType.args[0].name).toBe('Float');
});

test('Type annotation parsing - parses type constructor with type variable', () => {
	const result = parseType('Option a');
	assertParseSuccess(result);
	expect(result.value.kind).toBe('variant');
	const variantType = result.value as any;
	expect(variantType.name).toBe('Option');
	expect(variantType.args.length).toBe(1);
	expect(variantType.args[0].kind).toBe('variable');
	expect(variantType.args[0].name).toBe('a');
});

test('Type annotation parsing - parses type constructor with multiple arguments', () => {
	const result = parseType('Either String Float');
	assertParseSuccess(result);
	expect(result.value.kind).toBe('variant');
	const variantType = result.value as any;
	expect(variantType.name).toBe('Either');
	expect(variantType.args.length).toBe(2);
	expect(variantType.args[0].kind).toBe('primitive');
	expect(variantType.args[0].name).toBe('String');
	expect(variantType.args[1].kind).toBe('primitive');
	expect(variantType.args[1].name).toBe('Float');
});

test('Type annotation parsing - parses nested type constructor application', () => {
	const result = parseType('Option (Either String Float)');
	assertParseSuccess(result);
	expect(result.value.kind).toBe('variant');
	const variantType = result.value as any;
	expect(variantType.name).toBe('Option');
	expect(variantType.args.length).toBe(1);
	expect(variantType.args[0].kind).toBe('variant');
	expect(variantType.args[0].name).toBe('Either');
	expect(variantType.args[0].args.length).toBe(2);
});

test('Effect parsing - should parse function type with single effect', () => {
	const lexer = new Lexer('Float -> Float !write');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	expect([...funcType.effects]).toEqual(['write']);
	expect(funcType.params.length).toBe(1);
	expect(funcType.params[0].kind).toBe('primitive');
	expect(funcType.return.kind).toBe('primitive');
});

test('Effect parsing - should parse function type with multiple effects', () => {
	const lexer = new Lexer('Float -> String !write !log');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseSuccess(result);
	assertFunctionType(result.value);
	const funcType = result.value;
	expect([...funcType.effects].sort()).toEqual(['log', 'write']);
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
	expect([...funcType.effects].sort()).toEqual([
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
	expect([...funcType.effects]).toEqual([]);
});

test('Effect parsing - should reject invalid effect names', () => {
	const lexer = new Lexer('Float -> Float !invalid');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseError(result);
	expect(result.error.includes('Invalid effect: invalid')).toBeTruthy();
});

test('Effect parsing - should require effect name after exclamation mark', () => {
	const lexer = new Lexer('Float -> Float !');
	const tokens = lexer.tokenize();
	const result = parseTypeExpression(tokens);

	assertParseError(result);
	expect(result.error.includes('Expected effect name after !')).toBeTruthy();
});

test('Top-level definitions with type annotations - parses definition with function type annotation', () => {
	const result = parseDefinition(
		'sum = fn x y => x + y : Float -> Float -> Float;'
	);
	expect(result.statements.length).toBe(1);
	expect(result.statements[0].kind).toBe('definition');
	const def = assertDefinitionExpression(result.statements[0]);
	expect(def.name).toBe('sum');
	expect(def.value.kind).toBe('function');
});

test('Top-level definitions with type annotations - parses definition with primitive type annotation', () => {
	const result = parseDefinition('answer = 42 : Float;');
	expect(result.statements.length).toBe(1);
	expect(result.statements[0].kind).toBe('definition');
	const def = assertDefinitionExpression(result.statements[0]);
	expect(def.name).toBe('answer');
	const typed = assertTypedExpression(def.value);
	expect(typed.expression.kind).toBe('literal');
	expect(typed.type.kind).toBe('primitive');
});

test('Top-level definitions with type annotations - parses definition with list type annotation', () => {
	const result = parseDefinition('numbers = [1, 2, 3] : List Float;');
	expect(result.statements.length).toBe(1);
	const def = assertDefinitionExpression(result.statements[0]);
	expect(def.name).toBe('numbers');
	const typed = assertTypedExpression(def.value);
	expect(typed.expression.kind).toBe('list');
	expect(typed.type.kind).toBe('list'); // List types have kind "list"
	expect((typed.type as any).element.kind).toBe('primitive'); // Float is a primitive type
	expect((typed.type as any).element.name).toBe('Float');
});

