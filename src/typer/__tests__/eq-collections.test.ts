import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { Evaluator } from '../../evaluator/evaluator';
import { test, expect } from 'bun:test';
import { assertConstructorValue } from '../../../test/utils';

const evaluate = (code: string) => {
	const program = parse(new Lexer(code).tokenize());
	const typeResult = typeAndDecorate(program);
	const evaluator = new Evaluator({
		traitRegistry: typeResult.state.traitRegistry,
	});
	return evaluator.evaluateProgram(program).finalResult;
};

// ========================================
// Eq Option
// ========================================

test('Eq Option - Some equal values compare True', () => {
	const result = evaluate('equals (Some 1) (Some 1)');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq Option - Some different values compare False', () => {
	const result = evaluate('equals (Some 1) (Some 2)');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Option - None equals None', () => {
	const result = evaluate('equals None None');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq Option - Some vs None compares False', () => {
	const result = evaluate('equals (Some 1) None');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Option - None vs Some compares False', () => {
	const result = evaluate('equals None (Some 1)');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Option - nested Option equality Some(Some)', () => {
	const result = evaluate('equals (Some (Some 42)) (Some (Some 42))');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

// ========================================
// Eq Result
// ========================================

test('Eq Result - Ok equal values compare True', () => {
	const result = evaluate('equals (Ok 1) (Ok 1)');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq Result - Ok different values compare False', () => {
	const result = evaluate('equals (Ok 1) (Ok 2)');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Result - Err equal values compare True', () => {
	const result = evaluate('equals (Err "oops") (Err "oops")');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq Result - Err different values compare False', () => {
	const result = evaluate('equals (Err "a") (Err "b")');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Result - Ok vs Err compares False', () => {
	const result = evaluate('equals (Ok 1) (Err "oops")');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq Result - Err vs Ok compares False', () => {
	const result = evaluate('equals (Err "oops") (Ok 1)');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

// ========================================
// Eq List
// ========================================

test('Eq List - equal lists compare True', () => {
	const result = evaluate('equals [1, 2, 3] [1, 2, 3]');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq List - different element compares False', () => {
	const result = evaluate('equals [1, 2] [1, 3]');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq List - different length compares False', () => {
	const result = evaluate('equals [1, 2] [1, 2, 3]');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq List - empty lists compare True', () => {
	const result = evaluate('equals [] []');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq List - empty vs non-empty compares False', () => {
	const result = evaluate('equals [] [1]');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq List - string lists compare correctly', () => {
	const result = evaluate('equals ["a", "b"] ["a", "b"]');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});
