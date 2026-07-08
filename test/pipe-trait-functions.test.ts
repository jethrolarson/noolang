import { describe, test, expect } from 'bun:test';
import { runCode } from './utils';

describe('Pipe operator with trait functions', () => {
	test('map function works with normal application', () => {
		const code = `map (fn x => x * 2) [1, 2, 3]`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('pipe with head function works correctly', () => {
		const code = `[1, 2, 3] | head`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 1 }] });
		expect(result.finalType).toBe('Option Float');
	});

	test('pipe with regular multi-argument functions works', () => {
		const code = `
		myMap = fn f list => map f list;
		[1, 2, 3] | myMap (fn x => x * 2)
		`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
	});

	test('function composition with map works correctly', () => {
		const code = `
		double = fn x => x * 2;
		mapDouble = map double;
		mapDouble [1, 2, 3]
		`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('multiple map applications work with normal syntax', () => {
		const code = `
		doubled = map (fn x => x * 2) [1, 2, 3];
		result = map (fn x => x + 1) doubled;
		result
		`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([3, 5, 7]);
		expect(result.finalType).toBe('List Float');
	});

	test('partially applied trait functions work correctly', () => {
		const code = `
		mapDouble = map (fn x => x * 2);
		mapDouble [1, 2, 3]
		`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('pipe with map resolves the Functor constructor to List', () => {
		const code = `[1, 2, 3] | map (fn x => x * 2)`;

		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('chained pipes with trait functions keep resolving the constructor', () => {
		const code = `
		[1, 2, 3]
		| map (fn x => x * 2)
		| map (fn x => x + 1)
		`;

		const result = runCode(code);
		expect(result.finalValue).toEqual([3, 5, 7]);
		expect(result.finalType).toBe('List Float');
	});

	test('chaining across different trait functions (map show | join)', () => {
		// Regression: `map show` must resolve to `List String` (not a free `c String`)
		// so the following `join` (which needs `List String`) unifies.
		const code = `[1, 2, 3] | map show | join ", "`;

		const result = runCode(code);
		expect(result.finalValue).toBe('1, 2, 3');
		expect(result.finalType).toBe('String');
	});
});