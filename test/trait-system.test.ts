import { describe, test, expect } from 'bun:test';
import { runCode } from './utils';

describe('Trait System - Basic Arithmetic Functions', () => {
	test('add function should work for Float', () => {
		const code = `add 5 3`;
		const result = runCode(code);
		expect(result.finalValue).toBe(8);
		expect(result.finalType).toBe('Float');
	});

	test('add function should work for String', () => {
		const code = `add "hello " "world"`;
		const result = runCode(code);
		expect(result.finalValue).toBe('hello world');
		expect(result.finalType).toBe('String');
	});

	test('subtract function should work for Float', () => {
		const code = `subtract 10 3`;
		const result = runCode(code);
		expect(result.finalValue).toBe(7);
		expect(result.finalType).toBe('Float');
	});

	test('multiply function should work for Float', () => {
		const code = `multiply 4 5`;
		const result = runCode(code);
		expect(result.finalValue).toBe(20);
		expect(result.finalType).toBe('Float');
	});

	test('divide function should return Option Float', () => {
		const code = `divide 10 2`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 5 }] });
		expect(result.finalType).toBe('Option Float');
	});

	test('divide by zero should return None', () => {
		const code = `divide 10 0`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
		expect(result.finalType).toBe('Option Float');
	});

	test('modulus function should work for Float', () => {
		const code = `modulus 10 3`;
		const result = runCode(code);
		expect(result.finalValue).toBe(1);
		expect(result.finalType).toBe('Float');
	});
});

describe('Trait System - Partial Application', () => {
	test('add should be partially applicable', () => {
		const code = `
		addFive = add 5;
		addFive 3
		`;
		const result = runCode(code);
		expect(result.finalValue).toBe(8);
		expect(result.finalType).toBe('Float');
	});

	test('multiply should be partially applicable', () => {
		const code = `
		double = multiply 2;
		double 7
		`;
		const result = runCode(code);
		expect(result.finalValue).toBe(14);
		expect(result.finalType).toBe('Float');
	});

	test('divide should be partially applicable', () => {
		const code = `
		halve = divide 2;
		halve 10
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 5 }] });
		expect(result.finalType).toBe('Option Float');
	});
});

describe('Trait System - Show Constraint', () => {
	test('show should work for Float', () => {
		const code = `show 42`;
		const result = runCode(code);
		expect(result.finalValue).toBe('42');
		expect(result.finalType).toBe('String');
	});

	test('show should work for String', () => {
		const code = `show "hello"`;
		const result = runCode(code);
		expect(result.finalValue).toBe('hello');
		expect(result.finalType).toBe('String');
	});

	test('show should work for Bool', () => {
		const code = `show True`;
		const result = runCode(code);
		expect(result.finalValue).toBe('True');
		expect(result.finalType).toBe('String');
	});

	test('show should work for List with showable elements', () => {
		const code = `show [1, 2, 3]`;
		const result = runCode(code);
		expect(result.finalValue).toBe('[1, 2, 3]');
		expect(result.finalType).toBe('String');
	});

	test('show should work for Option', () => {
		const code = `show (Some 42)`;
		const result = runCode(code);
		expect(result.finalValue).toBe('Some(42)');
		expect(result.finalType).toBe('String');
	});
});

describe('Trait System - Eq Constraint', () => {
	test('equals should work for Float', () => {
		const code = `equals 5 5`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'True', args: [] });
		expect(result.finalType).toBe('Bool');
	});

	test('equals should work for String', () => {
		const code = `equals "hello" "hello"`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'True', args: [] });
		expect(result.finalType).toBe('Bool');
	});

	test('equals should work for Bool', () => {
		const code = `equals True True`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'True', args: [] });
		expect(result.finalType).toBe('Bool');
	});
});

describe('Trait System - Integration with |? operator', () => {
	test('|? should work with divide for safe division chains', () => {
		const code = `
		result = Some 12 |? (divide 2) |? (multiply 3);
		result
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 18 }] });
		expect(result.finalType).toBe('Option Float');
	});

	test('|? should short-circuit on None from division by zero', () => {
		const code = `
		result = Some 12 |? (divide 0) |? (multiply 3);
		result
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
		expect(result.finalType).toBe('Option Float');
	});

	test('temperature conversion using |? and trait functions', () => {
		const code = `
		celsiusToFahrenheit = fn celsius => 
		  (multiply celsius 9) |? (divide 5) |? (add 32);
		celsiusToFahrenheit 100
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 212 }] });
		expect(result.finalType).toBe('Option Float');
	});
});

describe('Trait System - map function', () => {
	test('map should work with List', () => {
		const code = `map (multiply 2) [1, 2, 3]`;
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test('map should work with Option', () => {
		const code = `map (add 1) (Some 5)`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'Some', args: [{ tag: 'number', value: 6 }] });
		expect(result.finalType).toBe('Option Float');
	});

	test('map should preserve None', () => {
		const code = `map (add 1) None`;
		const result = runCode(code);
		expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
		expect(result.finalType).toBe('Option Float');
	});
});

describe('Trait System - pipe operator with trait functions', () => {
	test.skip('pipe should work with single-argument trait functions', () => {
		const code = `5 | (add 3)`;
		const result = runCode(code);
		expect(result.finalValue).toBe(8);
		expect(result.finalType).toBe('Float');
	});

	test.skip('pipe should work with map and trait functions', () => {
		const code = `[1, 2, 3] | map (multiply 2)`;
		const result = runCode(code);
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.finalType).toBe('List Float');
	});

	test.skip('pipe should work with chained trait functions', () => {
		const code = `
		[1, 2, 3] 
		| map (multiply 2)
		| map (add 1)
		`;
		const result = runCode(code);
		expect(result.finalValue).toEqual([3, 5, 7]);
		expect(result.finalType).toBe('List Float');
	});
});