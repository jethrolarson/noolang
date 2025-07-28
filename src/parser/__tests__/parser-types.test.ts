import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import type { TypeDefinitionExpression } from '../../ast';

// Helper function for type-safe testing
function assertTypeDefinitionExpression(
	expr: any
): TypeDefinitionExpression {
	if (expr.kind !== 'type-definition') {
		throw new Error(`Expected type definition expression, got ${expr.kind}`);
	}
	return expr;
}

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

test('Type Definitions (ADTs) - should parse type definition with parameters', () => {
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

test('Type Definitions (ADTs) - should parse type definition with complex constructors', () => {
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

test('Type Definitions (ADTs) - should parse type definition with multiple constructor arguments', () => {
	const lexer = new Lexer('type Person = Person String Float');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	const typeDef = assertTypeDefinitionExpression(program.statements[0]);
	assert.is(typeDef.name, 'Person');
	assert.is(typeDef.constructors.length, 1);
	assert.is(typeDef.constructors[0].name, 'Person');
	assert.is(typeDef.constructors[0].args.length, 2);
});

test.run();