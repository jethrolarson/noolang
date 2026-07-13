import { test, expect, describe } from 'bun:test';
import { expectSuccess } from '../../../test/utils';

describe('sort_by (stdlib)', () => {
	test('sorts numbers ascending with an explicit less-than predicate', () => {
		expectSuccess('sort_by (fn a b => a < b) [3, 1, 4, 1, 5]', [
			1, 1, 3, 4, 5,
		]);
	});

	test('sorts descending when the predicate is reversed', () => {
		expectSuccess('sort_by (fn a b => a > b) [3, 1, 4, 1, 5]', [
			5, 4, 3, 1, 1,
		]);
	});

	test('sorts tuples by a derived key', () => {
		const code = `
			pairs = [{"c", 1}, {"a", 3}, {"b", 2}];
			sort_by (fn x y => (
				{ka, va} = x;
				{kb, vb} = y;
				va < vb
			)) pairs
		`;
		expectSuccess(code, [
			['c', 1],
			['b', 2],
			['a', 3],
		]);
	});

	test('sort_by on an empty list returns an empty list', () => {
		expectSuccess('sort_by (fn a b => a < b) ([] : List Float)', []);
	});
});
