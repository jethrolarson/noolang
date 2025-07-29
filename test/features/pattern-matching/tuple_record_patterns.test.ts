import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { Evaluator } from '../../../src/evaluator/evaluator';
import { typeProgram } from '../../../src/typer';
import type { MatchExpression } from '../../../src/ast';

// Helper function for type-safe testing
function assertMatchExpression(expr: any): MatchExpression {
	if (expr.kind !== 'match') {
		throw new Error(`Expected match expression, got ${expr.kind}`);
	}
	return expr;
}

// Helper to evaluate expressions
function evaluateCode(code: string): any {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	// Type check first
	typeProgram(program);
	
	// Then evaluate
	const evaluator = new Evaluator();
	const evalResult = evaluator.evaluateProgram(program);
	return evalResult.finalResult;
}

// --- Parser Tests ---

test('Tuple Pattern Parsing - should parse simple tuple pattern', () => {
	const lexer = new Lexer('match point with ( {x, y} => x + y; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	assert.is(program.statements.length, 1);
	
	const matchExpr = assertMatchExpression(program.statements[0]);
	assert.is(matchExpr.cases.length, 2);
	assert.is(matchExpr.cases[0].pattern.kind, 'tuple');
	
	const tuplePattern = matchExpr.cases[0].pattern as any;
	assert.is(tuplePattern.elements.length, 2);
	assert.is(tuplePattern.elements[0].kind, 'variable');
	assert.is(tuplePattern.elements[0].name, 'x');
	assert.is(tuplePattern.elements[1].kind, 'variable');
	assert.is(tuplePattern.elements[1].name, 'y');
});

test('Record Pattern Parsing - should parse simple record pattern', () => {
	const lexer = new Lexer('match person with ( {@name n, @age a} => n; _ => "unknown" )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const matchExpr = assertMatchExpression(program.statements[0]);
	const recordPattern = matchExpr.cases[0].pattern as any;
	assert.is(recordPattern.kind, 'record');
	assert.is(recordPattern.fields.length, 2);
	
	assert.is(recordPattern.fields[0].fieldName, 'name');
	assert.is(recordPattern.fields[0].pattern.kind, 'variable');
	assert.is(recordPattern.fields[0].pattern.name, 'n');
	
	assert.is(recordPattern.fields[1].fieldName, 'age');
	assert.is(recordPattern.fields[1].pattern.kind, 'variable');
	assert.is(recordPattern.fields[1].pattern.name, 'a');
});

// --- Evaluation Tests ---

test('Tuple Pattern Evaluation - should match and bind tuple elements', () => {
	const result = evaluateCode(`
		point = {10, 20};
		match point with (
			{x, y} => x + y;
			_ => 0
		)
	`);
	assert.is(result.value, 30);
});

test('Tuple Pattern Evaluation - should match literal values in tuples', () => {
	const result = evaluateCode(`
		origin = {0, 0};
		match origin with (
			{0, 0} => "origin";
			{x, 0} => "x-axis";
			{0, y} => "y-axis";
			_ => "other"
		)
	`);
	assert.is(result.value, 'origin');
});

test('Record Pattern Evaluation - should match and bind record fields', () => {
	const result = evaluateCode(`
		person = {@name "Alice", @age 30};
		match person with (
			{@name n, @age a} => n + " is " + (toString a);
			_ => "unknown"
		)
	`);
	assert.is(result.value, 'Alice is 30');
});

test('Record Pattern Evaluation - should match specific field values', () => {
	const result = evaluateCode(`
		user = {@role "admin", @name "Alice"};
		match user with (
			{@role "admin", @name n} => "Administrator: " + n;
			{@role "user", @name n} => "User: " + n;
			_ => "unknown role"
		)
	`);
	assert.is(result.value, 'Administrator: Alice');
});

test('Nested Pattern Evaluation - should handle nested tuple patterns', () => {
	const result = evaluateCode(`
		nested = {1, {2, 3}};
		match nested with (
			{x, {y, z}} => x + y + z;
			_ => 0
		)
	`);
	assert.is(result.value, 6);
});

test('Nested Pattern Evaluation - should handle nested record patterns', () => {
	const result = evaluateCode(`
		complex = {@user {@name "Alice", @id 123}, @status "active"};
		match complex with (
			{@user {@name "Alice"}, @status s} => "Alice is " + s;
			{@user {@name n}, @status s} => n + " is " + s;
			_ => "unknown"
		)
	`);
	assert.is(result.value, 'Alice is active');
});

test('Mixed ADT and Data Structure Patterns - should work with Option types', () => {
	const result = evaluateCode(`
		data = Some {10, 20};
		match data with (
			Some {x, y} => x * y;
			Some _ => 0;
			None => -1
		)
	`);
	assert.is(result.value, 200);
});

test('Record Pattern Evaluation - should support partial field matching', () => {
	const result = evaluateCode(`
		user = {@name "Bob", @age 25, @city "NYC", @email "bob@example.com"};
		match user with (
			{@name "Alice"} => "Found Alice";
			{@name n} => "User: " + n;
			_ => "No name"
		)
	`);
	assert.is(result.value, 'User: Bob');
});

test.run();