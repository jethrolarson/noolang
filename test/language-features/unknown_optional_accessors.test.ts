import { test, expect, describe } from 'bun:test';
import { parseAndType, runCode, assertTupleValue } from '../utils';

describe('Unknown optional accessors and at (typing only)', () => {
	test('@field? applied to Unknown yields Option Unknown (present field)', () => {
		const res = parseAndType('r = { @name "Alice" }; u = forget r; u | @name?');
		expect(res.type.kind).toBe('variant');
		if (res.type.kind === 'variant') {
			expect(res.type.name).toBe('Option');
			// inner is Unknown (rendered as type variable here, so just assert variant wrapper)
		}
		// No effects at typing time (runtime adapters not wired)
		expect(res.effects.size).toBe(0);
	});

	test('@field? applied to Unknown yields Option Unknown (missing field)', () => {
		const res = parseAndType('r = { @age 30 }; u = forget r; u | @name?');
		expect(res.type.kind).toBe('variant');
		if (res.type.kind === 'variant') {
			expect(res.type.name).toBe('Option');
		}
		expect(res.effects.size).toBe(0);
	});

	test('at applied to Unknown list container yields Option Unknown', () => {
		const res = parseAndType('xs = [1, 2, 3]; u = forget xs; at 0 u');
		expect(res.type.kind).toBe('variant');
		if (res.type.kind === 'variant') {
			expect(res.type.name).toBe('Option');
		}
		expect(res.effects.size).toBe(0);
	});
});

describe('Unknown optional accessors runtime behavior', () => {
	test('@field? on Unknown with present field returns Some Unknown', () => {
		const result = runCode('r = { @name "Alice" }; u = forget r; u | @name?');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'string', value: 'Alice' }], // The field value should be preserved
		});
	});

	test('@field? on Unknown with missing field returns None', () => {
		const result = runCode('r = { @age 30 }; u = forget r; u | @name?');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'None',
			args: [],
		});
	});

	test('@field? on Unknown preserves the underlying value structure', () => {
		const result = runCode(
			'r = { @name "Alice", @age 30 }; u = forget r; nameOpt = u | @name?; ageOpt = u | @age?; {nameOpt, ageOpt}'
		);
		// Both should be Some with the original values preserved
		expect(result.evalResult.finalResult.tag).toBe('tuple');
		assertTupleValue(result.evalResult.finalResult);
		expect(result.evalResult.finalResult.values[0]).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'string', value: 'Alice' }],
		});
		expect(result.evalResult.finalResult.values[1]).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'number', value: 30 }],
		});
	});

	test('at on Unknown list returns Some Unknown for valid index', () => {
		const result = runCode('xs = [1, 2, 3]; u = forget xs; at 0 u');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'number', value: 1 }],
		});
	});

	test('at on Unknown list returns None for out of bounds index', () => {
		const result = runCode('xs = [1, 2, 3]; u = forget xs; at 10 u');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'None',
			args: [],
		});
	});
});
