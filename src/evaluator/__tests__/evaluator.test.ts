import {
	runCode,
	assertNumberValue,
	assertConstructorValue,
	assertStringValue,
} from '../../../test/utils';
import { describe, test, expect } from 'bun:test';
import { createNumber } from '../evaluator';

describe('Evaluator', () => {
	test('should set a field in a record using set', () => {
		const result = runCode(
			'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user2'
		);
		expect(result.finalValue).toEqual({ name: 'Alice', age: 31 });
	});

	test('should add a new field to a record using set', () => {
		const result = runCode(
			'user = { @name "Alice" }; user2 = set @age user 42; user2'
		);
		expect(result.finalValue).toEqual({ name: 'Alice', age: 42 });
	});

	test('set should not mutate the original record', () => {
		const result = runCode(
			'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user;'
		);
		expect(result.finalValue).toEqual({ name: 'Alice', age: 30 });
	});

	test('should evaluate number literals', () => {
		const result = runCode('42');
		expect(result.finalValue).toBe(42);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate string literals', () => {
		const result = runCode('"hello"');
		expect(result.finalValue).toBe('hello');
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate boolean literals', () => {
		const result = runCode('True');
		expect(result.finalValue).toBe(true);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate arithmetic operations', () => {
		const result = runCode('2 + 3');
		expect(result.finalValue).toBe(5);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate function definitions and applications', () => {
		const result = runCode('fn x => x + 1; (fn x => x + 1) 2');
		expect(result.finalValue).toBe(3);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate list operations', () => {
		const result = runCode('[1, 2, 3] | head');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Some',
			args: [createNumber(1)],
		});
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate map function', () => {
		const result = runCode('list_map (fn x => x * 2) [1, 2, 3]');
		expect(result.finalValue).toEqual([2, 4, 6]);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate filter function', () => {
		const result = runCode('filter (fn x => x > 2) [1, 2, 3, 4, 5]');
		expect(result.finalValue).toEqual([3, 4, 5]);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate reduce function', () => {
		const result = runCode('reduce (fn acc x => acc + x) 0 [1, 2, 3, 4, 5]');
		expect(result.finalValue).toBe(15);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate length function', () => {
		const result = runCode('length [1, 2, 3, 4, 5]');
		expect(result.finalValue).toBe(5);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate isEmpty function', () => {
		const result = runCode('isEmpty []; isEmpty [1, 2, 3]');
		expect(result.finalValue).toBe(false);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate append function', () => {
		const result = runCode('append [1, 2] [3, 4]');
		expect(result.finalValue).toEqual([1, 2, 3, 4]);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate math utility functions', () => {
		const result = runCode('abs 5; max 3 7; min 3 7');
		expect(result.finalValue).toBe(3);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate string utility functions', () => {
		const result = runCode('concat "hello" " world"; toString 42');
		expect(result.finalValue).toBe('42');
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate if expressions', () => {
		const result = runCode('if True then 1 else 2');
		expect(result.finalValue).toBe(1);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate if expressions with false condition', () => {
		const result = runCode('if False then 1 else 2');
		expect(result.finalValue).toBe(2);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should evaluate comparison operations', () => {
		const result = runCode('2 < 3');
		expect(result.finalValue).toBe(true);
		expect(result.evalResult.executionTrace.length).toBe(1);
	});

	test('should throw on undefined variables', () => {
		expect(() => {
			runCode('undefined_var');
		}).toThrow();
	});

	test('should handle variant errors in arithmetic', () => {
		expect(() => {
			runCode('"hello" + 5');
		}).toThrow();
	});

	test('Recursion - should handle factorial recursion', () => {
		const result = runCode(`
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 5
      `);
		expect(result.finalValue).toBe(120);
	});

	test('Recursion - should handle factorial with 0', () => {
		const result = runCode(`
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 0
      `);
		expect(result.finalValue).toBe(1);
	});

	test('Recursion - should handle factorial with 1', () => {
		const result = runCode(`
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 1
      `);
		expect(result.finalValue).toBe(1);
	});

	test('Recursion - should handle fibonacci recursion', () => {
		const result = runCode(`
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 10
      `);
		expect(result.finalValue).toBe(55);
	});

	test('Recursion - should handle fibonacci with small values', () => {
		const result = runCode(`
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 0; fibonacci 1; fibonacci 2; fibonacci 3
      `);
		expect(result.finalValue).toBe(2);
	});

	test('Recursion - should handle recursive list length', () => {
		const result = runCode(`
        recLength = fn list => if isEmpty list then 0 else 1 + (recLength (tail list));
        recLength [1, 2, 3, 4, 5]
      `);
		expect(result.finalValue).toBe(5);
	});

	test('Recursion - should handle recursive list sum', () => {
		const result = runCode(`
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recSum = fn list => if isEmpty list then 0 else (getSome (head list)) + (recSum (tail list));
        recSum [1, 2, 3, 4, 5]
      `);
		expect(result.finalValue).toBe(15);
	});

	test('Recursion - should handle recursive list reverse', () => {
		const result = runCode(`
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recReverse = fn list => if isEmpty list then [] else append (recReverse (tail list)) [getSome (head list)];
        recReverse [1, 2, 3]
      `);
		expect(result.finalValue).toEqual([3, 2, 1]);
	});

	test('Recursion - should handle recursive power function', () => {
		const result = runCode(`
        power = fn base exp => if exp == 0 then 1 else base * (power base (exp - 1));
        power 2 8
      `);
		expect(result.finalValue).toBe(256);
	});

	test('Recursion - should handle recursive gcd function', () => {
		const result = runCode(`
        gcd = fn a b => 
          if a == b then a 
          else if a > b then gcd (a - b) b 
          else gcd a (b - a);
        gcd 48 18
      `);
		expect(result.finalValue).toBe(6);
	});

	test('Recursion - should handle recursive function with multiple parameters', () => {
		const result = runCode(`
        mult = fn a b => if b == 0 then 0 else a + (mult a (b - 1));
        mult 3 4
      `);
		expect(result.finalValue).toBe(12);
	});

	test('Recursion - should handle recursive function in sequence', () => {
		const result = runCode(`
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        a = factorial 3;
        b = factorial 4;
        a + b
      `);
		expect(result.finalValue).toBe(30);
	});

	test('should evaluate top-level definitions and use them', () => {
		const result = runCode('addNums = fn x y => x + y; addNums 2 3');
		expect(result.finalValue).toBe(5);
	});

	// TODO: Implement imports
	test.skip('should evaluate basic import', () => {
		const result = runCode('import "test/test_import"');
		expect(result.finalValue).toBe(42);
	});

	test('should evaluate single-field record', () => {
		const result = runCode('{ @name "Alice", @age 30 }');
		expect(result.finalValue).toEqual({ name: 'Alice', age: 30 });
	});

	test('should evaluate multi-field record (semicolon separated)', () => {
		const result = runCode('{ @name "Alice", @age 30 }');
		expect(result.finalValue).toEqual({ name: 'Alice', age: 30 });
	});

	test('should evaluate accessor on record', () => {
		const result = runCode('user = { @name "Alice", @age 30 }; (@name user)');
		expect(result.finalValue).toBe('Alice');
	});

	test('definition with sequence on right side using parentheses', () => {
		const result = runCode('foo = (1; 2); foo');
		expect(result.finalValue).toBe(2);
	});

	test('multiple definitions sequenced', () => {
		const result = runCode('foo = 1; 2');
		expect(result.finalValue).toBe(2);
	});

	test('should evaluate function with unit parameter', () => {
		const result = runCode('foo = fn {} => "joe"; foo {}');
		expect(result.finalValue).toBe('joe');
	});

	test('should evaluate thrush operator', () => {
		const result = runCode('10 | (fn x => x + 1)');
		expect(result.finalValue).toBe(11);
	});

	test('should evaluate chained thrush operators', () => {
		const result = runCode(
			'[1, 2, 3] | list_map (fn x => x + 1) | list_map (fn x => x * x)'
		);
		expect(result.finalValue).toEqual([4, 9, 16]);
	});

	test('Top-level sequence evaluation - multiple definitions and final expression', () => {
		const result = runCode('a = 1; b = 2; a + b');
		expect(result.finalValue).toBe(3);
	});

	test('Top-level sequence evaluation - multiple definitions and final record', () => {
		const result = runCode(`
        addFunc = fn x y => x + y;
        sub = fn x y => x - y;
        math = { @add addFunc, @sub sub };
        math
      `);
		expect(result.evalResult.finalResult).toEqual(
			expect.objectContaining({
				fields: {
					add: expect.objectContaining({ tag: 'function' }),
					sub: expect.objectContaining({ tag: 'function' }),
				},
				tag: 'record',
			})
		);
	});

	test('Top-level sequence evaluation - sequence with trailing semicolon', () => {
		const result = runCode('a = 1; b = 2; a + b;');
		expect(result.finalValue).toBe(3);
	});

	test('duck-typed record accessor chain', () => {
		const result = runCode(`
      foo = {@bar {@baz fn x => {@qux x}, @extra 42}};
      (((foo | @bar) | @baz) $ 1) | @qux
    `);
		expect(result.finalValue).toEqual(1);
	});

	test('Semicolon sequencing - returns only the rightmost value', () => {
		expect(runCode('1; 2; 3').finalValue).toBe(3);
		expect(runCode('42; "hello"').finalValue).toBe('hello');
	});

	test('Semicolon sequencing - if-expression in sequence', () => {
		expect(runCode('1; if 2 < 3 then 4 else 5').finalValue).toBe(4);
		expect(runCode('1; if 2 > 3 then 4 else 5').finalValue).toBe(5);
		expect(runCode('1; if 2 < 3 then 4 else 5; 99').finalValue).toBe(99);
		expect(runCode('if 2 < 3 then 4 else 5; 42').finalValue).toBe(42);
	});

	test('Semicolon sequencing - definitions in sequence', () => {
		expect(runCode('x = 10; x + 5').finalValue).toBe(15);
		expect(runCode('a = 1; b = 2; a + b').finalValue).toBe(3);
	});

	test('Semicolon sequencing - complex sequencing', () => {
		expect(
			runCode('x = 1; if x == 1 then 100 else 200; x + 1').finalValue
		).toBe(2);
		expect(
			runCode('x = 1; y = 2; if x < y then x else y; x + y').finalValue
		).toBe(3);
	});

	function evalIfChain(x: number) {
		return runCode(
			`if ${x} == 0 then 0 else if ${x} == 1 then 1 else if ${x} == 2 then 2 else 99`
		).finalValue;
	}

	test('If associativity and nesting - returns 0 for x == 0', () => {
		expect(evalIfChain(0)).toBe(0);
	});

	test('If associativity and nesting - returns 1 for x == 1', () => {
		expect(evalIfChain(1)).toBe(1);
	});

	test('If associativity and nesting - returns 2 for x == 2', () => {
		expect(evalIfChain(2)).toBe(2);
	});

	test('If associativity and nesting - returns 99 for x == 3', () => {
		expect(evalIfChain(3)).toBe(99);
	});

	test('Local Mutation - should allow defining and mutating a local variable', () => {
		const result = runCode('mut x = 1; mut! x = 42; x');
		expect(result.finalValue).toBe(42);
	});

	test('Local Mutation - should not affect other variables or outer scope', () => {
		const result = runCode('x = 5; mut y = 10; mut! y = 99; x + y');
		expect(result.finalValue).toBe(5 + 99);
	});

	test('Local Mutation - should throw if mut! is used on non-mutable variable', () => {
		expect(() => runCode('x = 1; mut! x = 2')).toThrow();
	});

	test('Local Mutation - should allow returning a mutable variable value (pass-by-value)', () => {
		const result = runCode('mut x = 7; mut! x = 8; x');
		expect(result.finalValue).toBe(8);
	});

	test('Additional Coverage - should handle wildcard pattern', () => {
		const result = runCode(`
        value = "anything";
        match value with (
          _ => "wildcard matched"
        )
      `);
		expect(result.finalValue).toBe('wildcard matched');
	});

	test('Additional Coverage - should handle variable pattern with binding', () => {
		const result = runCode(`
        value = 123;
        match value with (
          x => x + 1
        )
      `);
		expect(result.finalValue).toBe(124);
	});

	test('Additional Coverage - should handle constructor pattern matching', () => {
		const result = runCode(`
        variant MyType = A | B Float;
        value = B 42;
        match value with (
          A => 0;
          B x => x
        )
      `);
		expect(result.finalValue).toBe(42);
	});

	test('Additional Coverage - should throw error when no pattern matches', () => {
		expect(() =>
			runCode(`
        variant Color = Red | Blue;
        value = Red;
        match value with (
          Blue => "blue"
        )
      `)
		).toThrow();
	});

	test('Additional Coverage - should convert number to string', () => {
		const result = runCode('toString 42');
		expect(result.finalValue).toBe('42');
	});

	test('Additional Coverage - should convert string to string with quotes', () => {
		const result = runCode('toString "hello"');
		expect(result.finalValue).toBe('"hello"');
	});

	test('Additional Coverage - should convert boolean True to string', () => {
		const result = runCode('toString True');
		expect(result.finalValue).toBe('True');
	});

	test('Additional Coverage - should convert boolean False to string', () => {
		const result = runCode('toString False');
		expect(result.finalValue).toBe('False');
	});

	test('Additional Coverage - should convert list to string', () => {
		const result = runCode('toString [1, 2, 3]');
		expect(result.finalValue).toBe('[1; 2; 3]');
	});

	test('Additional Coverage - should convert tuple to string', () => {
		const result = runCode('toString {1, 2, 3}');
		expect(result.finalValue).toBe('{1; 2; 3}');
	});

	test('Additional Coverage - should convert record to string', () => {
		const result = runCode('toString { @name "Alice", @age 30 }');
		expect(result.finalValue).toBe('{@name "Alice"; @age 30}');
	});

	test('Additional Coverage - should convert unit to string', () => {
		const result = runCode('toString {}');
		expect(result.finalValue).toBe('unit');
	});

	test('Additional Coverage - should convert function to string', () => {
		const result = runCode('toString (fn x => x + 1)');
		expect(result.finalValue).toBe('<function>');
	});

	test('Additional Coverage - should convert constructor without args to string', () => {
		const result = runCode(`
        variant Color = Red | Green | Blue;
        toString Red
      `);
		expect(result.finalValue).toBe('Red');
	});

	test('Additional Coverage - should convert constructor with args to string', () => {
		const result = runCode(`
        variant Option a = Some a | None;
        toString (Some 42)
      `);
		expect(result.finalValue).toBe('Some 42');
	});

	test('Additional Coverage - should handle abs function', () => {
		const result = runCode('abs (-5)');
		expect(result.finalValue).toBe(5);
	});

	test('Additional Coverage - should handle max function', () => {
		const result = runCode('max 5 10');
		expect(result.finalValue).toBe(10);
	});

	test('Additional Coverage - should handle min function', () => {
		const result = runCode('min 5 10');
		expect(result.finalValue).toBe(5);
	});

	test('Additional Coverage - should handle concat function', () => {
		const result = runCode('concat "hello" " world"');
		expect(result.finalValue).toBe('hello world');
	});

	test('Additional Coverage - should handle hasKey function', () => {
		const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "name"
      `);
		expect(result.finalValue).toBe(true);
	});

	test('Additional Coverage - should handle hasKey with missing key', () => {
		const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "height"
      `);
		expect(result.finalValue).toBe(false);
	});

	test('Additional Coverage - should handle hasValue with missing value', () => {
		const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasValue record 42
      `);
		expect(result.finalValue).toBe(false);
	});

	test('Additional Coverage - should handle randomRange function', () => {
		const result = runCode('randomRange 1 10');
		const finalResult = result.evalResult.finalResult;
		assertNumberValue(finalResult);
		expect(finalResult.value >= 1).toBeTruthy();
		expect(finalResult.value <= 10).toBeTruthy();
	});

	test('Additional Coverage - should handle invalid function application', () => {
		expect(() => runCode('42 5')).toThrow();
	});

	test('Additional Coverage - should handle mutGet error with non-mutable', () => {
		expect(() => runCode('mutGet 42')).toThrow();
	});

	test('Additional Coverage - should handle mutSet error with non-mutable', () => {
		expect(() => runCode('mutSet 42 100')).toThrow();
	});

	test('Additional Coverage - should handle nullary constructors', () => {
		const result = runCode(`
        variant Color = Red | Green | Blue;
        Red
      `);
		assertConstructorValue(result.evalResult.finalResult);
		expect(result.evalResult.finalResult.name).toBe('Red');
		expect(result.evalResult.finalResult.args).toEqual([]);
	});

	test('Additional Coverage - should handle constructor with arguments', () => {
		const result = runCode(`
        variant Point = Point Float Float;
        Point 10 20
      `);
		assertConstructorValue(result.evalResult.finalResult);
		expect(result.evalResult.finalResult.name).toBe('Point');
		expect(result.evalResult.finalResult.args.length).toBe(2);
	});

	test('Additional Coverage - should handle curried constructor application', () => {
		const result = runCode(`
        variant Point = Point Float Float;
        partialPoint = Point 10;
        partialPoint 20
      `);
		assertConstructorValue(result.evalResult.finalResult);
		expect(result.evalResult.finalResult.name).toBe('Point');
		expect(result.evalResult.finalResult.args.length).toBe(2);
	});

	test('Additional Coverage - should handle nested scopes with pattern matching', () => {
		const result = runCode(`
        outer = 10;
        value = 42;
        match value with (
          x => x + outer
        )
      `);
		expect(result.finalValue).toBe(52);
	});

	test('Additional Coverage - should handle function scoping', () => {
		const result = runCode(`
        x = 1;
        f = fn y => x + y;
        f 10
      `);
		expect(result.finalValue).toBe(11);
	});

	test('should evaluate optional accessor on present field returns Some', () => {
		const result = runCode(
			'user = { @name "Alice" }; get = @name?; get user'
		);
		assertConstructorValue(result.evalResult.finalResult);
		expect(result.evalResult.finalResult.name).toBe('Some');
		const arg0 = result.evalResult.finalResult.args[0];
		assertStringValue(arg0);
		expect(arg0.value).toBe('Alice');
		// And final type should be Option String
		expect(result.finalType.includes('Option')).toBe(true);
	});

	test('should evaluate optional accessor on missing field returns None', () => {
		const result = runCode(
			'user = { @name "Alice" }; get = @age?; get user'
		);
		expect(result.evalResult.finalResult).toEqual({ tag: 'constructor', name: 'None', args: [] });
		expect(result.finalType.includes('Option')).toBe(true);
	});

	test('non-optional accessor on missing field should throw', () => {
		let threw = false;
		try {
			runCode('user = { @name "Alice" }; get = @age; get user');
		} catch (_e) {
			threw = true;
		}
		expect(threw).toBe(true);
	});
});
