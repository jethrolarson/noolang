import { test, expect } from 'bun:test';
import { runCode } from '../utils';

test('should load stdlib and have length function', () => {
	const code = `length [1, 2, 3]`;
	const result = runCode(code);
	expect(result.finalValue).toBe(3);
});

test('should work with == operator directly', () => {
	const code = `(length [1, 2, 3]) == 3`;
	const result = runCode(code);
	expect(result.finalValue).toBe(true);
});

test('should work with if expression directly', () => {
	const code = `if (length [1, 2, 3]) == 3 then "yes" else "no"`;
	const result = runCode(code);
	expect(result.finalValue).toBe('yes');
});

test('should work with list_get directly', () => {
	const code = `list_get 0 [1, 2, 3]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 1 }],
	});
});

test('head function should work with simple list', () => {
	const code = `head [1]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 1 }],
	});
});

test('head function should work with integer lists', () => {
	const code = `head [1, 2, 3]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 1 }],
	});
});

test('head function should work with string lists', () => {
	const code = `head ["a", "b", "c"]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'string', value: 'a' }],
	});
});

test('head function should work with boolean lists', () => {
	const code = `head [True, False, True]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'constructor', name: 'True', args: [] }],
	});
});

test('head function should work with nested lists', () => {
	const code = `head [[1, 2], [3, 4], [5, 6]]`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [
			{
				tag: 'list',
				values: [
					{ tag: 'number', value: 1 },
					{ tag: 'number', value: 2 },
				],
			},
		],
	});
});

test('head function should return None for empty list', () => {
	const code = `head []`;
	const result = runCode(code);
	expect(result.finalValue).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});
