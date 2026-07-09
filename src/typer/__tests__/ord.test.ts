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

const typeCheck = (code: string) => {
	const program = parse(new Lexer(code).tokenize());
	return typeAndDecorate(program);
};

// ========================================
// String comparison operators
// ========================================

test('Ord String - less than "a" < "b" is True', () => {
	const result = evaluate('"a" < "b"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - less than "b" < "a" is False', () => {
	const result = evaluate('"b" < "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Ord String - less than equal strings is False', () => {
	const result = evaluate('"a" < "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Ord String - greater than "b" > "a" is True', () => {
	const result = evaluate('"b" > "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - greater than "a" > "b" is False', () => {
	const result = evaluate('"a" > "b"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Ord String - less than or equal "a" <= "a" is True', () => {
	const result = evaluate('"a" <= "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - less than or equal "a" <= "b" is True', () => {
	const result = evaluate('"a" <= "b"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - less than or equal "b" <= "a" is False', () => {
	const result = evaluate('"b" <= "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Ord String - greater than or equal "b" >= "a" is True', () => {
	const result = evaluate('"b" >= "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - greater than or equal "a" >= "a" is True', () => {
	const result = evaluate('"a" >= "a"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord String - greater than or equal "a" >= "b" is False', () => {
	const result = evaluate('"a" >= "b"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Ord String - lexicographic comparison "apple" < "banana"', () => {
	const result = evaluate('"apple" < "banana"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

// ========================================
// Float comparison still works
// ========================================

test('Ord Float - 1 < 2 is True', () => {
	const result = evaluate('1 < 2');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord Float - 2 > 1 is True', () => {
	const result = evaluate('2 > 1');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

// ========================================
// Ord trait function less_than on String
// ========================================

test('Ord String - less_than trait function works on strings', () => {
	const result = evaluate('less_than "a" "b"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Ord Float - less_than trait function works on floats', () => {
	const result = evaluate('less_than 1 2');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

// ========================================
// Ord constraint is enforced at type-check time
// ========================================

test('Ord - comparing records (no Ord impl) is rejected at type-check', () => {
	expect(() => typeCheck('{@a 1} < {@a 2}')).toThrow();
});

test('Ord - comparing a user variant with no Ord impl is rejected at type-check', () => {
	const code = 'variant Foo = Bar; (Bar) < (Bar)';
	expect(() => typeCheck(code)).toThrow();
});

test('Ord - String and Float still type-check under Ord constraint', () => {
	expect(() => typeCheck('"a" < "b"')).not.toThrow();
	expect(() => typeCheck('1 < 2')).not.toThrow();
	expect(() => typeCheck('3.0 <= 4.0')).not.toThrow();
});
