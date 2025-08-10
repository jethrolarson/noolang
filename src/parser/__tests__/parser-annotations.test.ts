import { Lexer } from '../../lexer/lexer';
import { parse, parseTypeExpression } from '../parser';
import { test, expect, describe } from 'bun:test';
import {
	assertParseSuccess,
	assertParseError,
	assertRecordType,
	assertTupleType,
	assertListType,
	assertFunctionType,
	assertVariableType,
	assertDefinitionExpression,
	assertTypedExpression,
	assertPrimitiveType,
	assertVariantType,
	assertFunctionExpression,
	assertLiteralExpression,
} from '../../../test/utils';

// Helper functions for parsing
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
describe('Type annotations', () => {
	describe('Top-level sequence parsing', () => {
		test('multiple definitions and final expression', () => {
			const lexer = new Lexer('a = 1; b = 2; a + b');
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			expect(program.statements.length).toBe(1);
			const seq = program.statements[0];
			expect(seq.kind).toBe('binary'); // semicolon sequence
		});

		test('multiple definitions and final record', () => {
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

		test('sequence with trailing semicolon', () => {
			const lexer = new Lexer('a = 1; b = 2; a + b;');
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			expect(program.statements.length).toBe(1);
			const seq = program.statements[0];
			expect(seq.kind).toBe('binary');
		});
	});

	describe('Type annotation parsing', () => {
		test(' parses record type annotation', () => {
			const result = parseType('{ name: String, age: Float }');
			assertParseSuccess(result);
			assertRecordType(result.value);
			expect(result.value.kind).toBe('record');
			expect(result.value.fields).toHaveProperty('name');
			expect(result.value.fields).toHaveProperty('age');
			expect(result.value.fields.name.kind).toBe('primitive');
			expect(result.value.fields.age.kind).toBe('primitive');
		});

		test(' parses tuple type annotation', () => {
			const result = parseType('{ Float, String }');
			assertParseSuccess(result);
			assertTupleType(result.value);
			assertPrimitiveType(result.value.elements[0]);
			assertPrimitiveType(result.value.elements[1]);
		});

		test(' parses list type annotation', () => {
			const result = parseType('List Float');
			assertParseSuccess(result);
			assertListType(result.value);
			assertPrimitiveType(result.value.element);
		});

		test(' parses function type annotation', () => {
			const result = parseType('Float -> Float');
			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			assertPrimitiveType(funcType.params[0]);
			assertPrimitiveType(funcType.return);
		});

		test(' parses type variable', () => {
			const result = parseType('a');
			assertParseSuccess(result);
			assertVariableType(result.value);
			expect(result.value.name).toBe('a');
		});

		test(' parses simple type constructor application', () => {
			const result = parseType('Option Float');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			assertPrimitiveType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('Float');
		});

		test(' parses type constructor with type variable', () => {
			const result = parseType('Option a');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			assertVariableType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('a');
		});

		test(' parses type constructor with multiple arguments', () => {
			const result = parseType('Either String Float');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Either');
			expect(variantType.args.length).toBe(2);
			assertPrimitiveType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('String');
			assertPrimitiveType(variantType.args[1]);
			expect(variantType.args[1].name).toBe('Float');
		});

		test(' parses nested type constructor application', () => {
			const result = parseType('Option (Either String Float)');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			expect(variantType.args.length).toBe(1);
			assertVariantType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('Either');
			expect(variantType.args[0].args.length).toBe(2);
		});
	});
	describe('Effect parsing', () => {
		test('should parse function type with single effect', () => {
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

		test('should parse function type with multiple effects', () => {
			const lexer = new Lexer('Float -> String !write !log');
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects].sort()).toEqual(['log', 'write']);
		});

		test('should parse function type with all valid effects', () => {
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

		test('should parse function type with no effects', () => {
			const lexer = new Lexer('Float -> Float');
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects]).toEqual([]);
		});

		test('should reject invalid effect names', () => {
			const lexer = new Lexer('Float -> Float !invalid');
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);

			assertParseError(result);
			expect(result.error.includes('Invalid effect: invalid')).toBeTruthy();
		});

		test('should require effect name after exclamation mark', () => {
			const lexer = new Lexer('Float -> Float !');
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);

			assertParseError(result);
			expect(
				result.error.includes('Expected effect name after !')
			).toBeTruthy();
		});
	});
	describe('Top-level definitions with type annotations', () => {
		test('parses definition with function type annotation', () => {
			const result = parseDefinition(
				'sum = fn x y => x + y : Float -> Float -> Float;'
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('sum');
			assertFunctionExpression(def.value);
		});

		test('parses definition with primitive type annotation', () => {
			const result = parseDefinition('answer = 42 : Float;');
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('answer');
			const typed = def.value;
			assertTypedExpression(typed);
			assertLiteralExpression(typed.expression);
			assertPrimitiveType(typed.type);
		});

		test('parses definition with list type annotation', () => {
			const result = parseDefinition('numbers = [1, 2, 3] : List Float');
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('numbers');
			const typed = def.value;
			assertTypedExpression(typed);
			assertListType(typed.type);
			assertPrimitiveType(typed.type.element);
			expect(typed.type.element.name).toBe('Float');
		});
	});

	test('Function type annotation after lambda body binds to the lambda (not the body)', () => {
		const code = `
map_err = fn f res => match res with (
  Ok x => Ok x;
  Err e => Err (f e)
) : (b -> c) -> Result a b -> Result a c
`;
		const result = parseDefinition(code);
		expect(result.statements.length).toBe(1);
		const def = result.statements[0];
		assertDefinitionExpression(def);
		// We expect the definition value to be a typed expression wrapping a function
		assertTypedExpression(def.value);
		assertFunctionExpression(def.value.expression);
	});

	test('Lambda type annotation after simple body binds to the lambda', () => {
		const code = `
add_func = fn x y => x + y : Float -> Float -> Float;
`;
		const result = parseDefinition(code);
		expect(result.statements.length).toBe(1);
		const def = result.statements[0];
		assertDefinitionExpression(def);
		assertTypedExpression(def.value);
		assertFunctionExpression(def.value.expression);
	});
});