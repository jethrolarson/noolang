import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { Evaluator } from '../../../src/evaluator/evaluator';
import { typeProgram } from '../../../src/typer';
import type { MatchExpression } from '../../../src/ast';
import { describe, test, expect } from 'bun:test';

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
	expect(program.statements.length).toBe(1);
	
	const matchExpr = assertMatchExpression(program.statements[0]);
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('tuple');
	
	const tuplePattern = matchExpr.cases[0].pattern as any;
	expect(tuplePattern.elements.length).toBe(2);
	expect(tuplePattern.elements[0].kind).toBe('variable');
	expect(tuplePattern.elements[0].name).toBe('x');
	expect(tuplePattern.elements[1].kind).toBe('variable');
	expect(tuplePattern.elements[1].name).toBe('y');
});

test('Record Pattern Parsing - should parse simple record pattern', () => {
	const lexer = new Lexer('match person with ( {@name n, @age a} => n; _ => "unknown" )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const matchExpr = assertMatchExpression(program.statements[0]);
	const recordPattern = matchExpr.cases[0].pattern as any;
	expect(recordPattern.kind).toBe('record');
	expect(recordPattern.fields.length).toBe(2);
	
	expect(recordPattern.fields[0].fieldName).toBe('name');
	expect(recordPattern.fields[0].pattern.kind).toBe('variable');
	expect(recordPattern.fields[0].pattern.name).toBe('n');
	
	expect(recordPattern.fields[1].fieldName).toBe('age');
	expect(recordPattern.fields[1].pattern.kind).toBe('variable');
	expect(recordPattern.fields[1].pattern.name).toBe('a');
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
	expect(result.value).toBe(30);
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
	expect(result.value).toBe('origin');
});

test('Record Pattern Evaluation - should match and bind record fields', () => {
	const result = evaluateCode(`
		person = {@name "Alice", @age 30};
		match person with (
			{@name n, @age a} => n + " is " + (toString a);
			_ => "unknown"
		)
	`);
	expect(result.value).toBe('Alice is 30');
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
	expect(result.value).toBe('Administrator: Alice');
});

test('Nested Pattern Evaluation - should handle nested tuple patterns', () => {
	const result = evaluateCode(`
		nested = {1, {2, 3}};
		match nested with (
			{x, {y, z}} => x + y + z;
			_ => 0
		)
	`);
	expect(result.value).toBe(6);
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
	expect(result.value).toBe('Alice is active');
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
	expect(result.value).toBe(200);
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
	expect(result.value).toBe('User: Bob');
});

