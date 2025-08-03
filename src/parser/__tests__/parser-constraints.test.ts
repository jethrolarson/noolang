import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { test, expect } from 'bun:test';
import {
	assertConstraintDefinitionExpression,
	assertFunctionType,
	assertImplementDefinitionExpression,
	assertVariableType,
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

test('should parse Functor constraint with map function', () => {
	const lexer = new Lexer(
		'constraint Functor f ( map : (a -> b) -> f a -> f b )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const constraintDef = program.statements[0];
	assertConstraintDefinitionExpression(constraintDef);
	expect(constraintDef.name).toBe('Functor');
	expect(constraintDef.typeParams).toEqual(['f']);
	expect(constraintDef.functions.length).toBe(1);
	expect(constraintDef.functions[0].name).toBe('map');

	// Check the function type
	const funcType = constraintDef.functions[0].type;
	assertFunctionType(funcType);
	expect(funcType.params.length).toBe(1);

	// The first parameter should be a function type (a -> b)
	const firstParam = funcType.params[0];
	assertFunctionType(firstParam);
	expect(firstParam.params.length).toBe(1); // a
	assertVariableType(firstParam.return);
	expect(firstParam.return.name).toBe('b');

	// The return type should be f a -> f b
	assertFunctionType(funcType.return);
	expect(funcType.return.params.length).toBe(1);
	assertVariantType(funcType.return.return);
	expect(funcType.return.return.name).toBe('f');
	expect(funcType.return.return.args.length).toBe(1);
	assertVariableType(funcType.return.return.args[0]);
	expect(funcType.return.return.args[0].name).toBe('b');
});
