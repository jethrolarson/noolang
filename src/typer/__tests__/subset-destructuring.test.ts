import { test, expect } from 'bun:test';
import { runCode, expectError } from '../../../test/utils';

// Record destructuring should bind a SUBSET of a record's fields, like match
// record patterns already do (issue: destructuring was total, match is partial).

test('subset destructuring - bind one field of a larger record', () => {
	const r = runCode('{@name} = {@name "A", @age 5}; name');
	expect(r.finalValue).toBe('A');
	expect(r.finalType).toBe('String');
});

test('subset destructuring - bind two of three fields', () => {
	const r = runCode('{@name, @age} = {@name "A", @age 5, @active True}; age');
	expect(r.finalValue).toBe(5);
});

test('subset destructuring - renaming a subset', () => {
	const r = runCode('{@name userName} = {@name "Alice", @age 30}; userName');
	expect(r.finalValue).toBe('Alice');
});

test('subset destructuring - exact match still works', () => {
	const r = runCode('{@name, @age} = {@name "A", @age 5}; name');
	expect(r.finalValue).toBe('A');
});

test('subset destructuring - the module pattern (import a subset)', () => {
	const r = runCode('{@add} = import "examples/math_module"; add 2 3');
	expect(r.finalValue).toBe(5);
});

test('subset destructuring - naming a field the record does not have is rejected', () => {
	expectError('{@missing} = {@name "A", @age 5}; missing');
});
