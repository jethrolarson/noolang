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

// Regression: Eq was implemented for Float and Bool but not String, so
// `equals "a" "b"` failed with "No implementation of trait function equals
// for String, String".
test('Eq String - equal strings compare True', () => {
	const result = evaluate('equals "hello" "hello"');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});

test('Eq String - different strings compare False', () => {
	const result = evaluate('equals "hello" "world"');
	assertConstructorValue(result);
	expect(result.name).toBe('False');
});

test('Eq String - empty strings compare True', () => {
	const result = evaluate('equals "" ""');
	assertConstructorValue(result);
	expect(result.name).toBe('True');
});
