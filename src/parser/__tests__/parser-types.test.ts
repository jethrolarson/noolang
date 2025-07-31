import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import { assertTypeDefinitionExpression } from '../../../test/utils';

test('Type Definitions (ADTs) - should parse simple type definition', () => {
	const lexer = new Lexer('type Bool = True | False');
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

test('Type Definitions (ADTs) - should parse type definition with parameters', () => {
	const lexer = new Lexer('type Option a = None | Some a');
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

test('Type Definitions (ADTs) - should parse type definition with complex constructors', () => {
	const lexer = new Lexer('type Either a b = Left a | Right b');
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

test('Type Definitions (ADTs) - should parse type definition with multiple constructor arguments', () => {
	const lexer = new Lexer('type Person = Person String Float');
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

