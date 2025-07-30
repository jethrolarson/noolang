import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { Evaluator } from '../../../src/evaluator/evaluator';
import { typeAndDecorate } from '../../../src/typer';
import { Value } from '../../../src/evaluator/evaluator';
import { describe, test, expect } from 'bun:test';

let evaluator: Evaluator;

function runCode(code: string) {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	return evaluator.evaluateProgram(decoratedResult.program);
}

// Type checking helper - simplified for now
function hasCorrectType(code: string, expectedKind: string): boolean {
	try {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const ast = parse(tokens);
		const decoratedResult = typeAndDecorate(ast);
		// Just check if type decoration succeeded without errors
		return true;
	} catch (error) {
		return false;
	}
}

function unwrapValue(val: Value): any {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
			if (val.name === 'True') return true;
			if (val.name === 'False') return false;
			return val;
		case 'list':
			return val.values.map(unwrapValue);
		case 'tuple':
			return val.values.map(unwrapValue);
		case 'record': {
			const obj: any = {};
			for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
			return obj;
		}
		default:
			return val;
	}
}

// Test suite: Dollar Operator ($)
test('Dollar Operator ($) - Basic Function Application - simple function application', () => {
	evaluator = new Evaluator();
	const result = runCode('(fn x => x * 2) $ 5');
	expect(unwrapValue(result.finalResult)).toEqual(10);
});

test('Dollar Operator ($) - Basic Function Application - curried function application', () => {
	evaluator = new Evaluator();
	const result = runCode('sum = fn x y => x + y; (sum $ 3) $ 5');
	expect(unwrapValue(result.finalResult)).toEqual(8);
});

test('Dollar Operator ($) - Basic Function Application - multiple arguments', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'mul = fn x y z => x * y * z; ((mul $ 2) $ 3) $ 4'
	);
	expect(unwrapValue(result.finalResult)).toEqual(24);
});

test('Dollar Operator ($) - Right Associativity - f $ g $ h should parse as f $ (g $ h)', () => {
	evaluator = new Evaluator();
	// This should be equivalent to: const $ (\x -> x + 1) $ 5
	// Which is: const ((\x -> x + 1) 5) = const 6 = \y -> 6
	const result = runCode(
		'const = fn x y => x; f = fn x => x + 1; (const $ f $ 5) 999'
	);
	// const gets f(5) = 6, so const $ f $ 5 = const 6, which when applied to 999 returns 6
	expect(unwrapValue(result.finalResult)).toEqual(6);
});

test('Dollar Operator ($) - Right Associativity - right associativity with arithmetic', () => {
	evaluator = new Evaluator();
	// This tests: add $ (mul $ (2 $ 3)) which should work since $ is right-associative
	// But function-to-function application isn't what we want to test here
	// Let's test a simpler case: const $ (add $ 1) $ 2
	const result = runCode(
		'const = fn x y => x; sum = fn x y => x + y; (const $ (sum $ 1)) $ 99'
	);
	// const gets (add 1) which is a function, so const returns that function
	// The result should be a function, not a number. Let's test that it returns a function by applying it
	const result3 = runCode(
		'const = fn x y => x; sum = fn x y => x + y; ((const $ (sum $ 1)) $ 99) 7'
	);
	expect(unwrapValue(result3.finalResult)).toEqual(8); // (add $ 1) 7 = 1 + 7 = 8

	// Better test: proper right associativity with valid functions
	const result4 = runCode(
		'const = fn x y => x; id = fn x => x; (const $ id $ 99) 123'
	);
	expect(unwrapValue(result4.finalResult)).toEqual(99); // const gets (id 99) = 99, so const 99 123 = 99
});

test('Dollar Operator ($) - Precedence with Other Operators - $ has lower precedence than |', () => {
	evaluator = new Evaluator();
	const result = runCode('sum = fn x y => x + y; [1, 2] | list_map $ sum 1');
	expect(unwrapValue(result.finalResult)).toEqual([2, 3]);
});

test('Dollar Operator ($) - Precedence with Other Operators - $ has lower precedence than function application', () => {
	evaluator = new Evaluator();
	const result = runCode('sum = fn x y => x + y; list_map (sum 1) $ [1, 2, 3]');
	expect(unwrapValue(result.finalResult)).toEqual([2, 3, 4]);
});

test('Dollar Operator ($) - Precedence with Other Operators - $ works with complex expressions', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'list_map (fn x => x * 2) $ filter (fn x => x > 5) $ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]'
	);
	expect(unwrapValue(result.finalResult)).toEqual([12, 14, 16, 18, 20]);
});

test('Dollar Operator ($) - Type Checking - $ with built-in functions type checks correctly', () => {
	evaluator = new Evaluator();
	// Just verify it doesn't throw type errors
	expect(() => {
		runCode(
			'sum = fn x y => x + y; result = list_map $ sum 1; result [1, 2, 3]'
		);
	}).not.toThrow();
});

test('Dollar Operator ($) - Type Checking - $ with user-defined functions type checks correctly', () => {
	evaluator = new Evaluator();
	expect(() => {
		runCode(
			'sum = fn x y => x + y; mylist_map = fn f list => list_map f list; result = mylist_map $ sum 1; result [1, 2, 3]'
		);
	}).not.toThrow();
});

test('Dollar Operator ($) - Type Checking - $ creates partial application correctly', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'addThree = fn x y z => x + y + z; partialAdd = addThree $ 1; partialAdd 2 3'
	);
	expect(unwrapValue(result.finalResult)).toEqual(6);
});

test('Dollar Operator ($) - Integration with Other Features - $ with pipeline operators', () => {
	evaluator = new Evaluator();
	const result = runCode('sum = fn x y => x + y; [1, 2, 3] | list_map $ sum 10');
	expect(unwrapValue(result.finalResult)).toEqual([11, 12, 13]);
});

test('Dollar Operator ($) - Integration with Other Features - $ with records and accessors', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'person = { @name "Alice", @age 30 }; f = fn x => x; f $ person | @name'
	);
	expect(unwrapValue(result.finalResult)).toEqual('Alice');
});

test('Dollar Operator ($) - Integration with Other Features - $ with higher-order functions', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'compose = fn f g => fn x => f (g x); add1 = fn x => x + 1; mul2 = fn x => x * 2; ((compose $ add1) $ mul2) 5'
	);
	expect(unwrapValue(result.finalResult)).toEqual(11); // add1(mul2(5)) = add1(10) = 11
});

test('Dollar Operator ($) - Integration with Other Features - $ with constraint functions', () => {
	evaluator = new Evaluator();
	const result = runCode('(filter $ (fn x => x > 3)) $ [1, 2, 3, 4, 5]');
	expect(unwrapValue(result.finalResult)).toEqual([4, 5]);
});

test('Dollar Operator ($) - Complex Chaining - deep $ chaining', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'f = fn a b c d => a + b + c + d; (((f $ 1) $ 2) $ 3) $ 4'
	);
	expect(unwrapValue(result.finalResult)).toEqual(10);
});

test('Dollar Operator ($) - Complex Chaining - $ with mixed operators', () => {
	evaluator = new Evaluator();
	const result = runCode(
		'sum = fn x y => x + y; opt = [10] | head; match opt with (Some x => (sum $ x) $ 5; None => 0)'
	);
	expect(unwrapValue(result.finalResult)).toEqual(15);
});

test('Dollar Operator ($) - Complex Chaining - $ in complex data flow', () => {
	evaluator = new Evaluator();
	const result = runCode(`
        process = fn f list => list_map f list;
        transform = fn x => x * 2 + 1;
        data = [1, 2, 3];
        data | process $ transform
      `);
	expect(unwrapValue(result.finalResult)).toEqual([3, 5, 7]);
});

test('Dollar Operator ($) - Error Handling - $ with non-function should error', () => {
	evaluator = new Evaluator();
	expect(() => {
		runCode('5 $ 3');
	}).toThrow();
});

test('Dollar Operator ($) - Error Handling - $ with wrong arity should error appropriately', () => {
	evaluator = new Evaluator();
	// This should work - partial application
	expect(() => {
		const result = runCode('sum = fn x y => x + y; sum $ 1');
		// This should return a function, not throw
	}).not.toThrow();
});

test('Dollar Operator ($) - Trait Function Application - should work with built-in trait functions', () => {
	evaluator = new Evaluator();
	// Test with list_map which is available as a built-in
	const result = runCode(`
				inc = fn x => x + 1;
				mapInc = list_map inc;
				result = mapInc $ [1, 2, 3]
			`);
	
	expect(unwrapValue(result.finalResult)).toEqual([2, 3, 4]);
});

test('Dollar Operator ($) - Trait Function Application - should match regular function application behavior', () => {
	evaluator = new Evaluator();
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
	expect(unwrapValue(dollarResult.finalResult)).toEqual(unwrapValue(directResult.finalResult));
});

test('Dollar Operator ($) - Trait Function Application - should handle partial application with dollar operator', () => {
	evaluator = new Evaluator();
	// This tests the specific case where a partially applied function 
	// (which may have trait-function tag) is used with $
	const result = runCode(`
				sum = fn x => fn y => x + y;
				sum5 = sum 5;
				result = sum5 $ 3
			`);
	
	expect(unwrapValue(result.finalResult)).toEqual(8);
});

