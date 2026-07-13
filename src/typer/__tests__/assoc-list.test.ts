import { test, expect, describe } from 'bun:test';
import { expectSuccess, runCode } from '../../../test/utils';

describe('Association-list helpers (stdlib)', () => {
	test('assoc_get finds the value for a matching key', () => {
		const result = runCode('assoc_get "b" [{"a", 1}, {"b", 2}]');
		expect(result.finalValue).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'number', value: 2 }],
		});
	});

	test('assoc_get returns None for a missing key', () => {
		const result = runCode('assoc_get "z" [{"a", 1}, {"b", 2}]');
		expect(result.finalValue).toEqual({
			tag: 'constructor',
			name: 'None',
			args: [],
		});
	});

	test('assoc_set inserts a new key', () => {
		expectSuccess('assoc_set "b" 2 [{"a", 1}]', [
			['a', 1],
			['b', 2],
		]);
	});

	test('assoc_set overwrites an existing key in place', () => {
		expectSuccess('assoc_set "a" 9 [{"a", 1}, {"b", 2}]', [
			['a', 9],
			['b', 2],
		]);
	});

	test('assoc_update applies a function to the existing value, or seeds a default', () => {
		expectSuccess(
			'assoc_update "a" (fn v => v + 1) 1 [{"a", 4}]',
			[['a', 5]]
		);
		expectSuccess(
			'assoc_update "z" (fn v => v + 1) 1 [{"a", 4}]',
			[
				['a', 4],
				['z', 1],
			]
		);
	});

	test('word_counts tallies word frequency via assoc_update', () => {
		const code = `
			tally = fn list => reduce (fn acc w => assoc_update w (fn c => c + 1) 1 acc) [] list;
			tally ["a", "b", "a", "a", "b", "c"]
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual([
			['a', 3],
			['b', 2],
			['c', 1],
		]);
	});
});
