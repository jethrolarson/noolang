import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { parseTypeExpression } from '../parse-type';
import { test, expect, describe } from 'bun:test';
import {
	assertTypeDefinitionExpression,
	assertFunctionType,
	assertVariantType,
} from '../../../test/utils';

function assertParseSuccess<T>(result: {
	success: boolean;
	value?: T;
}): asserts result is { success: true; value: T } {
	expect(result.success).toBe(true);
	if (!result.success) throw new Error('Parse failed');
}

test('Type Definitions (ADTs) - should parse simple variant definition', () => {
	const lexer = new Lexer('variant Bool = True | False');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const typeDef = program.statements[0];
	assertTypeDefinitionExpression(typeDef);
	expect(typeDef.name).toBe('Bool');
	expect(typeDef.typeParams).toEqual([]);
	expect(typeDef.constructors.length).toBe(2);
	expect(typeDef.constructors[0].name).toBe('True');
	expect(typeDef.constructors[0].args).toEqual([]);
	expect(typeDef.constructors[1].name).toBe('False');
	expect(typeDef.constructors[1].args).toEqual([]);
});

test('Type Definitions (ADTs) - should parse variant definition with parameters', () => {
	const lexer = new Lexer('variant Option a = None | Some a');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const typeDef = program.statements[0];
	assertTypeDefinitionExpression(typeDef);
	expect(typeDef.name).toBe('Option');
	expect(typeDef.typeParams).toEqual(['a']);
	expect(typeDef.constructors.length).toBe(2);
	expect(typeDef.constructors[0].name).toBe('None');
	expect(typeDef.constructors[0].args).toEqual([]);
	expect(typeDef.constructors[1].name).toBe('Some');
	expect(typeDef.constructors[1].args.length).toBe(1);
});

test('Type Definitions (ADTs) - should parse variant definition with complex constructors', () => {
	const lexer = new Lexer('variant Either a b = Left a | Right b');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const typeDef = program.statements[0];
	assertTypeDefinitionExpression(typeDef);
	expect(typeDef.name).toBe('Either');
	expect(typeDef.typeParams).toEqual(['a', 'b']);
	expect(typeDef.constructors.length).toBe(2);
	expect(typeDef.constructors[0].name).toBe('Left');
	expect(typeDef.constructors[1].name).toBe('Right');
});

test('Type Definitions (ADTs) - should parse variant definition with multiple constructor arguments', () => {
	const lexer = new Lexer('variant Person = Person String Float');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const typeDef = program.statements[0];
	assertTypeDefinitionExpression(typeDef);
	expect(typeDef.name).toBe('Person');
	expect(typeDef.constructors.length).toBe(1);
	expect(typeDef.constructors[0].name).toBe('Person');
	expect(typeDef.constructors[0].args.length).toBe(2);
});

describe('Unknown Type Parsing', () => {
	test('should parse Unknown as unknown type, not variant type', () => {
		const code = 'Unknown';
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();

		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		expect(result.value.kind).toBe('unknown');
	});

	test('should parse function type with Unknown correctly', () => {
		const code = 'Unknown -> Result a DecodeError';
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();

		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertFunctionType(result.value);
		expect(result.value.params[0].kind).toBe('unknown');
	});

	test('should parse complex polymorphic annotation from schema.noo', () => {
		const code =
			'(Unknown -> Result a DecodeError) -> Unknown -> Result (List a) DecodeError';
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();

		const result = parseTypeExpression(tokens);
		assertParseSuccess(result);
		assertFunctionType(result.value);
		expect(result.value.params.length).toBe(1);

		const firstParam = result.value.params[0];
		assertFunctionType(firstParam);
		expect(firstParam.params[0].kind).toBe('unknown');

		const returnFunc = result.value.return;
		assertFunctionType(returnFunc);
		expect(returnFunc.params[0].kind).toBe('unknown');
	});

	test('should distinguish between Unknown keyword and actual variants', () => {
		const unknownCode = 'Unknown';
		const unknownLexer = new Lexer(unknownCode);
		const unknownTokens = unknownLexer.tokenize();
		const unknownResult = parseTypeExpression(unknownTokens);
		assertParseSuccess(unknownResult);
		expect(unknownResult.value.kind).toBe('unknown');

		const variantCode = 'MyUnknown';
		const variantLexer = new Lexer(variantCode);
		const variantTokens = variantLexer.tokenize();
		const variantResult = parseTypeExpression(variantTokens);
		assertParseSuccess(variantResult);
		assertVariantType(variantResult.value);
		expect(variantResult.value.name).toBe('MyUnknown');
	});
});
