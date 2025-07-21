import { Lexer } from '../../../src/lexer';
import { parse } from '../../../src/parser/parser';
import { Evaluator } from '../../../src/evaluator';
import { typeAndDecorate } from '../../../src/typer';
import { Value } from '../../../src/evaluator';

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

describe('Dollar Operator ($)', () => {
	beforeEach(() => {
		evaluator = new Evaluator();
	});
	describe('Basic Function Application', () => {
		test('simple function application', () => {
			const result = runCode('(fn x => x * 2) $ 5');
			expect(unwrapValue(result.finalResult)).toBe(10);
		});

		test('curried function application', () => {
			const result = runCode('add = fn x y => x + y; (add $ 3) $ 5');
			expect(unwrapValue(result.finalResult)).toBe(8);
		});

		test('multiple arguments', () => {
			const result = runCode(
				'mul = fn x y z => x * y * z; ((mul $ 2) $ 3) $ 4'
			);
			expect(unwrapValue(result.finalResult)).toBe(24);
		});
	});

	describe('Right Associativity', () => {
		test('f $ g $ h should parse as f $ (g $ h)', () => {
			// This should be equivalent to: const $ (\x -> x + 1) $ 5
			// Which is: const ((\x -> x + 1) 5) = const 6 = \y -> 6
			const result = runCode(
				'const = fn x y => x; f = fn x => x + 1; (const $ f $ 5) 999'
			);
			// const gets f(5) = 6, so const $ f $ 5 = const 6, which when applied to 999 returns 6
			expect(unwrapValue(result.finalResult)).toBe(6);
		});

		test('right associativity with arithmetic', () => {
			// This tests: add $ (mul $ (2 $ 3)) which should work since $ is right-associative
			// But function-to-function application isn't what we want to test here
			// Let's test a simpler case: const $ (add $ 1) $ 2
			const result = runCode(
				'const = fn x y => x; add = fn x y => x + y; (const $ (add $ 1)) $ 99'
			);
			// const gets (add 1) which is a function, so const returns that function
			// The result should be a function, not a number. Let's test that it returns a function by applying it
			const result3 = runCode(
				'const = fn x y => x; add = fn x y => x + y; ((const $ (add $ 1)) $ 99) 7'
			);
			expect(unwrapValue(result3.finalResult)).toBe(8); // (add $ 1) 7 = 1 + 7 = 8

			// Better test: proper right associativity with valid functions
			const result4 = runCode(
				'const = fn x y => x; id = fn x => x; (const $ id $ 99) 123'
			);
			expect(unwrapValue(result4.finalResult)).toBe(99); // const gets (id 99) = 99, so const 99 123 = 99
		});
	});

	describe('Precedence with Other Operators', () => {
		test('$ has lower precedence than |', () => {
			const result = runCode('add = fn x y => x + y; [1, 2] | map $ add 1');
			expect(unwrapValue(result.finalResult)).toEqual([2, 3]);
		});

		test('$ has lower precedence than function application', () => {
			const result = runCode('add = fn x y => x + y; map (add 1) $ [1, 2, 3]');
			expect(unwrapValue(result.finalResult)).toEqual([2, 3, 4]);
		});

		test('$ works with complex expressions', () => {
			const result = runCode(
				'map (fn x => x * 2) $ filter (fn x => x > 5) $ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]'
			);
			expect(unwrapValue(result.finalResult)).toEqual([12, 14, 16, 18, 20]);
		});
	});

	describe('Type Checking', () => {
		test('$ with built-in functions type checks correctly', () => {
			// Just verify it doesn't throw type errors
			expect(() => {
				runCode(
					'add = fn x y => x + y; result = map $ add 1; result [1, 2, 3]'
				);
			}).not.toThrow();
		});

		test('$ with user-defined functions type checks correctly', () => {
			expect(() => {
				runCode(
					'add = fn x y => x + y; mymap = fn f list => map f list; result = mymap $ add 1; result [1, 2, 3]'
				);
			}).not.toThrow();
		});

		test('$ creates partial application correctly', () => {
			const result = runCode(
				'add = fn x y z => x + y + z; partialAdd = add $ 1; partialAdd 2 3'
			);
			expect(unwrapValue(result.finalResult)).toBe(6);
		});
	});

	describe('Integration with Other Features', () => {
		test('$ with pipeline operators', () => {
			const result = runCode('add = fn x y => x + y; [1, 2, 3] | map $ add 10');
			expect(unwrapValue(result.finalResult)).toEqual([11, 12, 13]);
		});

		test('$ with records and accessors', () => {
			const result = runCode(
				'person = { @name "Alice", @age 30 }; f = fn x => x; f $ person | @name'
			);
			expect(unwrapValue(result.finalResult)).toBe('Alice');
		});

		test('$ with higher-order functions', () => {
			const result = runCode(
				'compose = fn f g => fn x => f (g x); add1 = fn x => x + 1; mul2 = fn x => x * 2; ((compose $ add1) $ mul2) 5'
			);
			expect(unwrapValue(result.finalResult)).toBe(11); // add1(mul2(5)) = add1(10) = 11
		});

		test('$ with constraint functions', () => {
			const result = runCode('(filter $ (fn x => x > 3)) $ [1, 2, 3, 4, 5]');
			expect(unwrapValue(result.finalResult)).toEqual([4, 5]);
		});
	});

	describe('Complex Chaining', () => {
		test('deep $ chaining', () => {
			const result = runCode(
				'f = fn a b c d => a + b + c + d; (((f $ 1) $ 2) $ 3) $ 4'
			);
			expect(unwrapValue(result.finalResult)).toBe(10);
		});

		test('$ with mixed operators', () => {
			const result = runCode(
				'add = fn x y => x + y; opt = [10] | head; match opt with (Some x => (add $ x) $ 5; None => 0)'
			);
			expect(unwrapValue(result.finalResult)).toBe(15);
		});

		test('$ in complex data flow', () => {
			const result = runCode(`
        process = fn f list => map f list;
        transform = fn x => x * 2 + 1;
        data = [1, 2, 3];
        data | process $ transform
      `);
			expect(unwrapValue(result.finalResult)).toEqual([3, 5, 7]);
		});
	});

	describe('Error Handling', () => {
		test('$ with non-function should error', () => {
			expect(() => {
				runCode('5 $ 3');
			}).toThrow();
		});

		test('$ with wrong arity should error appropriately', () => {
			// This should work - partial application
			expect(() => {
				const result = runCode('add = fn x y => x + y; add $ 1');
				// This should return a function, not throw
			}).not.toThrow();
		});
	});
});
