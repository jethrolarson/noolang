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
