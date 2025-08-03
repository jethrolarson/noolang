import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

test('Constraint Deferral Investigation - Structural constraints should be deferred in function bodies (CURRENTLY FAILING)', () => {
	const result = parseAndType('fn obj => @name obj');
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('a -> b given a has {@name b}');
});

test('Constraint Deferral Investigation - Direct structural constraint resolution should work', () => {
	const result = parseAndType('@name {@name "Alice"}');
	const typeStr = typeToString(result.type, result.state.substitution);

	// This should work and return String
	expect(typeStr).toBe('String');
});

test.skip('Constraint Deferral Investigation - Function body structural constraints should resolve when applied', () => {
	const result = parseAndType(`
    getName = fn obj => @name obj;
    getName {@name "Alice"}
  `);
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('String');
});