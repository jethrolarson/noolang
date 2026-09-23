import { test, expect, describe } from 'bun:test';
import { runCode } from '../../utils';
describe('Pattern matching inferred ADTs', () => {
	test('should handle parametric ADT pattern matching', () => {
		const code = `
      variant Point a = Point a a;
      get_x = fn point => match point (Point x y => x);
      origin = Point 0 0;
      get_x origin
    `;
		const result = runCode(code);
		expect(result.finalValue).toBe(0);
	});

	test('should handle Option pattern matching in functions', () => {
		const code = `
      handle_option = fn opt => match opt (
        Some value => value * 2;
        None => 0
      );
      handle_option (Some 21)
    `;
		const result = runCode(code);
		expect(result.finalValue).toBe(42);
	});

	test('should handle Result pattern matching', () => {
		const code = `
      handle_result = fn res => match res (
        Ok value => value + 10;
        Err msg => 0
      );
      handle_result (Ok 32)
    `;
		const result = runCode(code);
		expect(result.finalValue).toBe(42);
	});

	test('should handle complex Shape pattern matching', () => {
		const code = `
      variant Shape = Circle Float | Rectangle Float Float;
      calculate_area = fn shape => match shape (
        Circle radius => radius * radius * 3;
        Rectangle width height => width * height
      );
      calculate_area (Circle 5)
    `;
		const result = runCode(code);
		expect(result.finalValue).toBe(75);
	});
});
