import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import {
	assertConstraintDefinitionExpression,
	assertImplementDefinitionExpression,
	assertVariantType,
} from '../../../test/utils';

test('should parse constraint definition', () => {
	const lexer = new Lexer('constraint Show a ( show : a -> String )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constraintDef = program.statements[0];
	assertConstraintDefinitionExpression(constraintDef);
	expect(constraintDef.name).toBe('Show');
	expect(constraintDef.typeParams).toEqual(['a']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('show');
});

test('should parse implement definition', () => {
	const lexer = new Lexer(
		'implement Monad Option ( return = Some; bind = fn opt f => match opt with ( Some x => f x; None => None ) )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const implDef = program.statements[0];
	assertImplementDefinitionExpression(implDef);
	expect(implDef.constraintName).toBe('Monad');
	assertVariantType(implDef.typeExpr);
	expect(implDef.typeExpr.name).toBe('Option');
	expect(implDef.implementations.length).toBe(2);
	expect(implDef.implementations[0].name).toBe('return');
	expect(implDef.implementations[1].name).toBe('bind');
});

test('should parse constraint with simple functions', () => {
	const lexer = new Lexer('constraint Eq a ( eq a : a -> a -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constraintDef = program.statements[0];
	assertConstraintDefinitionExpression(constraintDef);
	expect(constraintDef.name).toBe('Eq');
	expect(constraintDef.typeParams).toEqual(['a']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('eq');
	expect(constraintDef.functions[0].typeParams).toEqual(['a']);
});

test('should parse constraint definition with multiple type parameters', () => {
	const lexer = new Lexer('constraint Eq a b ( eq : a -> b -> Bool )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(program.statements.length).toBe(1);
	const constraintDef = program.statements[0];
	assertConstraintDefinitionExpression(constraintDef);
	expect(constraintDef.name).toBe('Eq');
	expect(constraintDef.typeParams).toEqual(['a', 'b']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('eq');
});

