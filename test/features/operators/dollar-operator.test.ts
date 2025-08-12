import { runCode } from '../../utils';
import { test, expect } from 'bun:test';

// Test suite: Dollar Operator ($)
test('Dollar Operator ($) - Basic Function Application - simple function application', () => {
	const result = runCode('(fn x => x * 2) $ 5');
	expect(result.finalValue).toEqual(10);
});

test('Dollar Operator ($) - Basic Function Application - curried function application', () => {
	const result = runCode('sum = fn x y => x + y; (sum $ 3) $ 5');
	expect(result.finalValue).toEqual(8);
});

test('Dollar Operator ($) - Basic Function Application - multiple arguments', () => {
	const result = runCode('mul = fn x y z => x * y * z; ((mul $ 2) $ 3) $ 4');
	expect(result.finalValue).toEqual(24);
});

test('Dollar Operator ($) - Right Associativity - f $ g $ h should parse as f $ (g $ h)', () => {
	// This should be equivalent to: const $ (\x -> x + 1) $ 5
	// Which is: const ((\x -> x + 1) 5) = const 6 = \y -> 6
	const result = runCode(
		'const = fn x y => x; f = fn x => x + 1; (const $ f $ 5) 999'
	);
	// const gets f(5) = 6, so const $ f $ 5 = const 6, which when applied to 999 returns 6
	expect(result.finalValue).toEqual(6);
});

test('Dollar Operator ($) - Right Associativity - right associativity with arithmetic', () => {
	// This tests: add $ (mul $ (2 $ 3)) which should work since $ is right-associative
	// But function-to-function application isn't what we want to test here
	// Let's test a simpler case: const $ (add $ 1) $ 2
	const result1 = runCode(
		'const = fn x y => x; sum = fn x y => x + y; (const $ (sum $ 1)) $ 99'
	);
	// const gets (sum $ 1) which is a function, so const returns that function
	// The result should be a function, not a number
	expect(result1.evalResult.finalResult.tag).toBe('function');
	// const gets (add 1) which is a function, so const returns that function
	// The result should be a function, not a number. Let's test that it returns a function by applying it
	const result3 = runCode(
		'const = fn x y => x; sum = fn x y => x + y; ((const $ (sum $ 1)) $ 99) 7'
	);
	expect(result3.finalValue).toEqual(8); // (add $ 1) 7 = 1 + 7 = 8

	// Better test: proper right associativity with valid functions
	const result4 = runCode(
		'const = fn x y => x; id = fn x => x; (const $ id $ 99) 123'
	);
	expect(result4.finalValue).toEqual(99); // const gets (id 99) = 99, so const 99 123 = 99
});

test('Dollar Operator ($) - Precedence with Other Operators - $ has lower precedence than |', () => {
	const result = runCode('sum = fn x y => x + y; [1, 2] | list_map $ sum 1');
	expect(result.finalValue).toEqual([2, 3]);
});

test('Dollar Operator ($) - Precedence with Other Operators - $ has lower precedence than function application', () => {
	const result = runCode('sum = fn x y => x + y; list_map (sum 1) $ [1, 2, 3]');
	expect(result.finalValue).toEqual([2, 3, 4]);
});

test('Dollar Operator ($) - Precedence with Other Operators - $ works with complex expressions', () => {
	const result = runCode(
		'list_map (fn x => x * 2) $ list_filter (fn x => x > 5) $ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]'
	);
	expect(result.finalValue).toEqual([12, 14, 16, 18, 20]);
});

test('Dollar Operator ($) - Type Checking - $ with built-in functions type checks correctly', () => {
	// Just verify it doesn't throw type errors
	expect(() => {
		runCode(
			'sum = fn x y => x + y; result = list_map $ sum 1; result [1, 2, 3]'
		);
	}).not.toThrow();
});

test('Dollar Operator ($) - Type Checking - $ with user-defined functions type checks correctly', () => {
	expect(() => {
		runCode(
			'sum = fn x y => x + y; mylist_map = fn f list => list_map f list; result = mylist_map $ sum 1; result [1, 2, 3]'
		);
	}).not.toThrow();
});

test('Dollar Operator ($) - Type Checking - $ creates partial application correctly', () => {
	const result = runCode(
		'addThree = fn x y z => x + y + z; partialAdd = addThree $ 1; partialAdd 2 3'
	);
	expect(result.finalValue).toEqual(6);
});

test('Dollar Operator ($) - Integration with Other Features - $ with pipeline operators', () => {
	const result = runCode(
		'sum = fn x y => x + y; [1, 2, 3] | list_map $ sum 10'
	);
	expect(result.finalValue).toEqual([11, 12, 13]);
});

test('Dollar Operator ($) - Integration with Other Features - $ with records and accessors', () => {
	const result = runCode(
		'person = { @name "Alice", @age 30 }; f = fn x => x; f $ person | @name'
	);
	expect(result.finalValue).toEqual('Alice');
});

test('Dollar Operator ($) - Integration with Other Features - $ with higher-order functions', () => {
	const result = runCode(
		'compose = fn f g => fn x => f (g x); add1 = fn x => x + 1; mul2 = fn x => x * 2; ((compose $ add1) $ mul2) 5'
	);
	expect(result.finalValue).toEqual(11); // add1(mul2(5)) = add1(10) = 11
});

test('Dollar Operator ($) - Integration with Other Features - $ with constraint functions', () => {
	const result = runCode('(list_filter $ (fn x => x > 3)) $ [1, 2, 3, 4, 5]');
	expect(result.finalValue).toEqual([4, 5]);
});

test('Dollar Operator ($) - Complex Chaining - deep $ chaining', () => {
	const result = runCode(
		'f = fn a b c d => a + b + c + d; (((f $ 1) $ 2) $ 3) $ 4'
	);
	expect(result.finalValue).toEqual(10);
});

test('Dollar Operator ($) - Complex Chaining - $ with mixed operators', () => {
	const result = runCode(
		'sum = fn x y => x + y; opt = [10] | head; match opt (Some x => (sum $ x) $ 5; None => 0)'
	);
	expect(result.finalValue).toEqual(15);
});

test('Dollar Operator ($) - Complex Chaining - $ in complex data flow', () => {
	const result = runCode(`
        process = fn f list => list_map f list;
        transform = fn x => x * 2 + 1;
        data = [1, 2, 3];
        data | process $ transform
      `);
	expect(result.finalValue).toEqual([3, 5, 7]);
});

test('Dollar Operator ($) - Error Handling - $ with non-function should error', () => {
	expect(() => {
		runCode('5 $ 3');
	}).toThrow();
});

test('Dollar Operator ($) - Error Handling - $ with wrong arity should error appropriately', () => {
	// Test partial application - should work and return a function
	const partialResult = runCode('sum = fn x y => x + y; sum $ 1');
	expect(partialResult.evalResult.finalResult.tag).toBe('function');

	// Test that the partial function can be applied
	const appliedResult = runCode('sum = fn x y => x + y; (sum $ 1) 2');
	expect(appliedResult.finalValue).toEqual(3);

	// Test that applying too many arguments to a fully applied function errors
	expect(() => {
		runCode('sum = fn x y => x + y; ((sum $ 1) $ 2) $ 3');
	}).toThrow();

	// Test that applying a function with insufficient arguments returns a function
	const insufficientResult = runCode('add3 = fn x y z => x + y + z; add3 $ 1');
	expect(insufficientResult.evalResult.finalResult.tag).toBe('function');

	// Test that the insufficient function can be completed
	const completedResult = runCode(
		'add3 = fn x y z => x + y + z; ((add3 $ 1) $ 2) $ 3'
	);
	expect(completedResult.finalValue).toEqual(6);
});

test('Dollar Operator ($) - Trait Function Application - should work with built-in trait functions', () => {
	// Test with list_map which is available as a built-in
	const result = runCode(`
				inc = fn x => x + 1;
				mapInc = list_map inc;
				result = mapInc $ [1, 2, 3]
			`);

	expect(result.finalValue).toEqual([2, 3, 4]);
});

test('Dollar Operator ($) - Trait Function Application - should match regular function application behavior', () => {
	const directResult = runCode(`
				inc = fn x => x + 1;
				mapInc = list_map inc;
				result = mapInc [1, 2, 3]
			`);

	const dollarResult = runCode(`
				inc = fn x => x + 1;
				mapInc = list_map inc;
				result = mapInc $ [1, 2, 3]
			`);

	// Both should produce the same result
	expect(dollarResult.finalValue).toEqual(directResult.finalValue);
});

test('Dollar Operator ($) - Trait Function Application - should handle partial application with dollar operator', () => {
	// This tests the specific case where a partially applied function
	// (which may have trait-function tag) is used with $
	const result = runCode(`
				sum = fn x => fn y => x + y;
				sum5 = sum 5;
				result = sum5 $ 3
			`);

	expect(result.finalValue).toEqual(8);
});
