import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { test, expect } from 'bun:test';
import {
	runCode,
	assertMatchExpression,
	assertTuplePattern,
	assertVariablePattern,
	assertRecordPattern,
} from '../../utils';

// --- Parser Tests ---

test('Tuple Pattern Parsing - should parse simple tuple pattern', () => {
	const lexer = new Lexer('match point with ( {x, y} => x + y; _ => 0 )');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements.length).toBe(1);
	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	expect(matchExpr.cases.length).toBe(2);
	expect(matchExpr.cases[0].pattern.kind).toBe('tuple');

	const tuplePattern = matchExpr.cases[0].pattern;
	assertTuplePattern(tuplePattern);
	expect(tuplePattern.elements.length).toBe(2);
	const x = tuplePattern.elements[0];
	assertVariablePattern(x);
	expect(x.name).toBe('x');
	const y = tuplePattern.elements[1];
	assertVariablePattern(y);
	expect(y.name).toBe('y');
});

test('Record Pattern Parsing - should parse simple record pattern', () => {
	const lexer = new Lexer(
		'match person with ( {@name n, @age a} => n; _ => "unknown" )'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	const matchExpr = program.statements[0];
	assertMatchExpression(matchExpr);
	const recordPattern = matchExpr.cases[0].pattern;
	assertRecordPattern(recordPattern);
	expect(recordPattern.fields.length).toBe(2);
	const name = recordPattern.fields[0].pattern;
	assertVariablePattern(name);
	expect(name.name).toBe('n');
	const age = recordPattern.fields[1].pattern;
	assertVariablePattern(age);
	expect(age.name).toBe('a');
	const nameField = recordPattern.fields[0];
	expect(nameField.fieldName).toBe('name');
	assertVariablePattern(nameField.pattern);
	expect(nameField.pattern.name).toBe('n');

	const ageField = recordPattern.fields[1];
	expect(ageField.fieldName).toBe('age');
	assertVariablePattern(ageField.pattern);
	expect(ageField.pattern.name).toBe('a');
});

// --- Evaluation Tests ---

test('Tuple Pattern Evaluation - should match and bind tuple elements', () => {
	expect(
		runCode(`
		point = {10, 20};
		match point with (
			{x, y} => x + y;
			_ => 0
		)
	`).finalValue
	).toBe(30);
});

test('Tuple Pattern Evaluation - should match literal values in tuples', () => {
	expect(
		runCode(`
		origin = {0, 0};
		match origin with (
			{0, 0} => "origin";
			{x, 0} => "x-axis";
			{0, y} => "y-axis";
			_ => "other"
		)
	`).finalValue
	).toBe('origin');
});

test('Record Pattern Evaluation - should match and bind record fields', () => {
	expect(
		runCode(`
		person = {@name "Alice", @age 30};
		match person with (
			{@name n, @age a} => n + " is " + (toString a);
			_ => "unknown"
		)
	`).finalValue
	).toBe('Alice is 30');
});

test('Record Pattern Evaluation - should match specific field values', () => {
	expect(
		runCode(`
		user = {@role "admin", @name "Alice"};
		match user with (
			{@role "admin", @name n} => "Administrator: " + n;
			{@role "user", @name n} => "User: " + n;
			_ => "unknown role"
		)
	`).finalValue
	).toBe('Administrator: Alice');
});

test('Nested Pattern Evaluation - should handle nested tuple patterns', () => {
	expect(
		runCode(`
		nested = {1, {2, 3}};
		match nested with (
			{x, {y, z}} => x + y + z;
			_ => 0
		)
	`).finalValue
	).toBe(6);
});

test('Nested Pattern Evaluation - should handle nested record patterns', () => {
	expect(
		runCode(`
		complex = {@user {@name "Alice", @id 123}, @status "active"};
		match complex with (
			{@user {@name "Alice"}, @status s} => "Alice is " + s;
			{@user {@name n}, @status s} => n + " is " + s;
			_ => "unknown"
		)
	`).finalValue
	).toBe('Alice is active');
});

test('Mixed ADT and Data Structure Patterns - should work with Option types', () => {
	expect(
		runCode(`
		data = Some {10, 20};
		match data with (
			Some {x, y} => x * y;
			Some _ => 0;
			None => -1
		)
	`).finalValue
	).toBe(200);
});

test('Record Pattern Evaluation - should support partial field matching', () => {
	expect(
		runCode(`
		user = {@name "Bob", @age 25, @city "NYC", @email "bob@example.com"};
		match user with (
			{@name "Alice"} => "Found Alice";
			{@name n} => "User: " + n;
			_ => "No name"
		)
	`).finalValue
	).toBe('User: Bob');
});
