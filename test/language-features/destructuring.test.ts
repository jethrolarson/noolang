import { test, expect } from 'bun:test';
import { runCode } from '../utils';

test('should destructure simple tuple', () => {
	const source = '{x, y} = {1, 2}; x + y';
	expect(runCode(source).finalValue).toEqual(3);
});

test('should destructure record with shorthand', () => {
	const source =
		'{@name, @age} = {@name "Bob", @age 25}; name + " is " + toString age';
	expect(runCode(source).finalValue).toEqual('Bob is 25');
});

test('should fail parsing for list destructuring', () => {
	const source = '[x, y] = [1, 2]';
	expect(() => runCode(source)).toThrow();
});

test('should destructure record with renaming', () => {
	const source =
		'{@name userName, @age userAge} = {@name "Charlie", @age 35}; userName + " is " + toString userAge';
	expect(runCode(source).finalValue).toEqual('Charlie is 35');
});

test('should destructure nested tuples', () => {
	const source = '{outer, {inner, rest}} = {1, {2, 3}}; outer + inner + rest';
	expect(runCode(source).finalValue).toEqual(6);
});

test('should destructure nested records', () => {
	const source =
		'{@user {@name, @age}} = {@user {@name "David", @age 40}}; name + " is " + toString age';
	expect(runCode(source).finalValue).toEqual('David is 40');
});

test('should destructure complex nested patterns', () => {
	const source =
		'{@coords {x, y}, @metadata {@name author}} = {@coords {10, 20}, @metadata {@name "Eve"}}; "Point (" + toString x + ", " + toString y + ") by " + author';
	expect(runCode(source).finalValue).toEqual('Point (10, 20) by Eve');
});

test('should destructure multiple levels of nesting', () => {
	const source =
		'{@data {@inner {@value}}} = {@data {@inner {@value 42}}}; value * 2';
	expect(runCode(source).finalValue).toEqual(84);
});

test('should work with import destructuring', () => {
	// First create a test module
	const moduleSource = `
		add_fn = fn x y => x + y;
		multiply_fn = fn x y => x * y;
		{@add add_fn, @multiply multiply_fn}
	`;
	
	// Write the module to a temporary file
	const fs = require('fs');
	fs.writeFileSync('temp_test_module.noo', moduleSource);
	
	try {
		const source = '{@add, @multiply} = import "temp_test_module"; add 3 4 + multiply 2 5';
		expect(runCode(source).finalValue).toEqual(17);
	} finally {
		// Clean up
		fs.unlinkSync('temp_test_module.noo');
	}
});

test('should work with import destructuring and renaming', () => {
	// First create a test module
	const moduleSource = `
		square = fn x => x * x;
		cube = fn x => x * x * x;
		{@square square, @cube cube}
	`;
	
	// Write the module to a temporary file
	const fs = require('fs');
	fs.writeFileSync('temp_test_module2.noo', moduleSource);
	
	try {
		const source = '{@square sq, @cube cb} = import "temp_test_module2"; sq 4 + cb 2';
		expect(runCode(source).finalValue).toEqual(24);
	} finally {
		// Clean up
		fs.unlinkSync('temp_test_module2.noo');
	}
});

test('should handle mixed tuple and record destructuring', () => {
	const source = `
		data = {@tuple {1, 2}, @record {@name "Test"}};
		{@tuple {first, second}, @record {@name text}} = data;
		toString first + toString second + text
	`;
	expect(runCode(source).finalValue).toEqual('12Test');
});

test('should throw error for missing fields in record destructuring', () => {
	const source = '{@name, @missing} = {@name "Test"}';
	expect(() => runCode(source)).toThrow('Field \'missing\' not found in record');
});

test('should throw error for tuple length mismatch', () => {
	const source = '{x, y, z} = {1, 2}';
	expect(() => runCode(source)).toThrow('Tuple length mismatch');
});

test('should throw error for type mismatch in destructuring', () => {
	const source = '{x, y} = "not a tuple"';
	expect(() => runCode(source)).toThrow('Cannot unify types');
});

test('should work in where expressions', () => {
	const source = `
		result where (
			{x, y} = {10, 20};
			{@name} = {@name "Test"};
			result = toString x + toString y + name
		)
	`;
	expect(runCode(source).finalValue).toEqual('1020Test');
});
