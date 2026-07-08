import { typesEqual } from '../helpers';
import { recordType, floatType, stringType, boolType } from '../../ast';
import { test, expect } from 'bun:test';

// Regression: two record types with the same field COUNT but different field
// NAMES must compare unequal without crashing. The record case previously
// looked up t1's keys in t2 without checking they exist, so a mismatched key
// yielded `undefined` and `typesEqual(fieldType, undefined)` threw
// "undefined is not an object (evaluating 't2.kind')".
test('typesEqual - records with same count, different keys are unequal (no crash)', () => {
	const r1 = recordType({
		name: stringType(),
		age: floatType(),
		address: stringType(),
	});
	const r2 = recordType({
		name: stringType(),
		age: floatType(),
		active: boolType(),
	});
	expect(typesEqual(r1, r2)).toBe(false);
	expect(typesEqual(r2, r1)).toBe(false);
});

test('typesEqual - records with identical keys and types are equal', () => {
	const r1 = recordType({ name: stringType(), age: floatType() });
	const r2 = recordType({ name: stringType(), age: floatType() });
	expect(typesEqual(r1, r2)).toBe(true);
});

test('typesEqual - records with same keys but different field types are unequal', () => {
	const r1 = recordType({ name: stringType(), age: floatType() });
	const r2 = recordType({ name: stringType(), age: boolType() });
	expect(typesEqual(r1, r2)).toBe(false);
});
