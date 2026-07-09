/**
 * Tests for correct return type resolution when calling trait functions directly.
 *
 * Regression test for the bug where `equals 1 2` returned `a` (an unresolved type
 * variable) instead of `Bool`. Root cause: handlePartialTraitFunctionApplication was
 * incorrectly adding concrete type constructor names like 'Bool' to its set of type
 * variables to freshen, replacing them with fresh unresolved variables.
 */
import { test, expect, describe } from 'bun:test';
import { typeToString } from '../helpers';
import { parseAndType } from '../../../test/utils';

describe('trait function direct calls resolve concrete return types', () => {
	test('equals 1 2 returns Bool', () => {
		const result = parseAndType('equals 1 2');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Bool');
	});

	test('equals "a" "b" returns Bool', () => {
		const result = parseAndType('equals "a" "b"');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Bool');
	});

	test('equals True False returns Bool (Bool implements Eq)', () => {
		const result = parseAndType('equals True False');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Bool');
	});

	test('show 42 returns String', () => {
		const result = parseAndType('show 42');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('String');
	});

	test('show "hello" returns String', () => {
		const result = parseAndType('show "hello"');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('String');
	});

	test('equals via == operator also returns Bool', () => {
		const result = parseAndType('1 == 2');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Bool');
	});

	test('partial application of equals preserves Bool in return position', () => {
		// equals 1 returns Float -> Bool
		const result = parseAndType('equals 1');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Float -> Bool');
	});
});
