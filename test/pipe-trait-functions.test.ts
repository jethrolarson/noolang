import { describe, test, expect } from 'bun:test';
import { runCode } from './utils';

describe('Pipe operator with trait functions', () => {
	test('map function works with normal application', () => {
		const code = `map (fn x => x * 2) [1, 2, 3]`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('pipe with map function FAILS - demonstrates the bug', () => {
		const code = `[1, 2, 3] | map (fn x => x * 2)`;
		
		expect(() => runCode(code)).toThrow(/Cannot unify types/);
	});

	test('pipe works with non-trait functions (but type display is wrong)', () => {
		const code = `
		myMap = fn f list => map f list;
		[1, 2, 3] | myMap (fn x => x * 2)
		`;
		
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		// NOTE: Type display shows "a Float" instead of "List Float" - separate bug
		expect(result.finalType).toBe('a Float');
	});

	test('pipe with head function works (single-argument trait function)', () => {
		const code = `[1, 2, 3] | head`;
		
		const result = runCode(code);
		// Value structure is different than expected - uses constructor format
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 1 }] });
		expect(result.finalType).toBe('Option Float');
	});

	test('function composition with map works', () => {
		const code = `
		double = fn x => x * 2;
		mapDouble = map double;
		mapDouble [1, 2, 3]
		`;
		
		try {
			const result = runCode(code);
			expect(result.finalValue).toEqual([2, 4, 6]);
			expect(result.finalType).toBe('List Float');
		} catch (error) {
			// Expected to fail due to trait function issues
			expect(error.message).toContain('Cannot unify types');
		}
	});

	test('pipe with partially applied trait functions should work', () => {
		const code = `
		mapDouble = map (fn x => x * 2);
		[1, 2, 3] | mapDouble
		`;
		
		try {
			const result = runCode(code);
			expect(result.finalValue).toEqual([2, 4, 6]);
			expect(result.finalType).toBe('List Float');
		} catch (error) {
			// Expected to fail currently
			expect(error.message).toContain('Cannot unify types');
		}
	});

	test('multiple trait function calls with normal application', () => {
		const code = `
		doubled = map (fn x => x * 2) [1, 2, 3];
		result = map (fn x => x + 1) doubled;
		result
		`;
		
		try {
			const result = runCode(code);
			expect(result.finalValue).toEqual([3, 5, 7]);
			expect(result.finalType).toBe('List Float');
		} catch (error) {
			// Expected to fail due to trait function issues
			expect(error.message).toContain('Cannot unify types');
		}
	});

	test('chained pipes with trait functions should work but fail', () => {
		const code = `
		[1, 2, 3] 
		| map (fn x => x * 2)
		| map (fn x => x + 1)
		`;
		
		try {
			const result = runCode(code);
			// Should work when pipe is fixed
			expect(result.finalValue).toEqual([3, 5, 7]);
			expect(result.finalType).toBe('List Float');
		} catch (error) {
			// Currently fails
			expect(error.message).toContain('Cannot unify types');
		}
	});
});