import { test, expect, describe } from 'bun:test';
import { expectSuccess, expectError, runCode } from '../../../test/utils';

describe('String decomposition builtins', () => {
	test('split breaks a string on a delimiter', () => {
		expectSuccess('split "," "a,b,c"', ['a', 'b', 'c']);
	});

	test('split with empty delimiter splits into characters', () => {
		expectSuccess('split "" "ab"', ['a', 'b']);
	});

	test('chars decomposes a string into single-character strings', () => {
		expectSuccess('chars "ab"', ['a', 'b']);
	});

	test('trim strips leading/trailing whitespace', () => {
		expectSuccess('trim "  hi  "', 'hi');
	});

	test('toUpper and toLower change case', () => {
		expectSuccess('toUpper "hi"', 'HI');
		expectSuccess('toLower "HI"', 'hi');
	});

	test('indexOf finds a substring, returning Some index', () => {
		const result = runCode('indexOf "b" "abc"');
		expect(result.finalValue).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'number', value: 1 }],
		});
	});

	test('indexOf returns None when the substring is absent', () => {
		const result = runCode('indexOf "z" "abc"');
		expect(result.finalValue).toEqual({
			tag: 'constructor',
			name: 'None',
			args: [],
		});
	});

	test('startsWith / endsWith', () => {
		expectSuccess('startsWith "ab" "abc"', true);
		expectSuccess('startsWith "bc" "abc"', false);
		expectSuccess('endsWith "bc" "abc"', true);
		expectSuccess('endsWith "ab" "abc"', false);
	});

	test('replace substitutes every occurrence', () => {
		expectSuccess('replace "a" "X" "banana"', 'bXnXnX');
	});

	test('substring slices by index range', () => {
		expectSuccess('substring 1 3 "abcdef"', 'bc');
	});

	test('split rejects a non-string delimiter at the type level', () => {
		expectError('split 1 "a"', /Expected: String/);
	});
});

describe('argv', () => {
	test('argv is an empty list when no program args are passed', () => {
		expectSuccess('argv', []);
	});
});

describe('filter and sort (stdlib)', () => {
	test('filter keeps elements matching the predicate', () => {
		expectSuccess('filter (fn x => x > 2) [1, 2, 3, 4]', [3, 4]);
	});

	test('sort orders a list of numbers via Ord', () => {
		expectSuccess('sort [3, 1, 4, 1, 5, 9, 2, 6]', [1, 1, 2, 3, 4, 5, 6, 9]);
	});

	test('sort orders a list of strings via Ord', () => {
		expectSuccess('sort ["banana", "apple", "cherry"]', [
			'apple',
			'banana',
			'cherry',
		]);
	});

	test('sort on an empty list returns an empty list', () => {
		expectSuccess('sort ([] : List Float)', []);
	});
});
