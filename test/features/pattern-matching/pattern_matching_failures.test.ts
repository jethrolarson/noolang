import { test, expect, describe } from 'bun:test';
import { runCode } from '../../utils';
/**
 * PATTERN MATCHING FAILURES - TYPE SYSTEM LIMITATION
 *
 * These tests are currently skipped because they expose a fundamental limitation
 * in the current type system: parametric ADT pattern matching is not properly
 * implemented. All tests fail with "Pattern expects constructor but got α".
 *
 * ROOT CAUSE: The type inference engine doesn't properly handle type variables (α)
 * when pattern matching on parametric ADTs. This requires significant type system
 * work to resolve type variables in pattern matching contexts.
 *
 * REQUIRED IMPROVEMENTS:
 * 1. Type inference for parametric ADTs in pattern matching
 * 2. Proper handling of type variables in constructor patterns
 * 3. Type variable instantiation during pattern matching
 *
 * STATUS: These tests should remain skipped until the type system is enhanced
 * to support parametric pattern matching. This is a known limitation that
 * requires substantial type system development work.
 */
describe('Pattern Matching Failures', () => {
	test('should handle parametric ADT pattern matching', () => {
		// FIXME: Currently fails with "Pattern expects constructor but got α"
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
		// FIXME: Currently fails with "Pattern expects constructor but got α"
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
		// FIXME: Currently fails with "Pattern expects constructor but got α"
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
		// FIXME: Currently fails with "Pattern expects constructor but got α"
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
