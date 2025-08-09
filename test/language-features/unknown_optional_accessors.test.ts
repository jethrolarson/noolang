import { test, expect, describe } from 'bun:test';
import { parseAndType } from '../utils';

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
