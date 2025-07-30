import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../../typer';
import { Evaluator } from '../evaluator';
import { Value } from '../evaluator';
import { describe, test, expect } from 'bun:test';

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

const runCode = (code: string) => {
	const evaluator = new Evaluator();
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	return evaluator.evaluateProgram(decoratedResult.program);
};

test('Evaluator - should set a field in a record using set', () => {
	const lexer = new Lexer(
		'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user2'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 31 });
});

test('Evaluator - should add a new field to a record using set', () => {
	const lexer = new Lexer(
		'user = { @name "Alice" }; user2 = set @age user 42; user2'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 42 });
});

test('Evaluator - set should not mutate the original record', () => {
	const lexer = new Lexer(
		'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user;'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate number literals', () => {
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(42);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate string literals', () => {
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe('hello');
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate boolean literals', () => {
	const result = runCode('True');
	expect(unwrapValue(result.finalResult)).toBe(true);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate arithmetic operations', () => {
	const lexer = new Lexer('2 + 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(5);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate function definitions and applications', () => {
	const lexer = new Lexer('fn x => x + 1; (fn x => x + 1) 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(3);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate list operations', () => {
	const lexer = new Lexer('[1, 2, 3] | head');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	const finalResult = unwrapValue(result.finalResult);
	expect(finalResult.name).toBe('Some');
	expect(unwrapValue(finalResult.args[0])).toBe(1);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate map function', () => {
	const lexer = new Lexer('list_map (fn x => x * 2) [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toEqual([2, 4, 6]);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate filter function', () => {
	const lexer = new Lexer('filter (fn x => x > 2) [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual([3, 4, 5]);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate reduce function', () => {
	const lexer = new Lexer('reduce (fn acc x => acc + x) 0 [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(15);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate length function', () => {
	const lexer = new Lexer('length [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(5);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate isEmpty function', () => {
	const lexer = new Lexer('isEmpty []; isEmpty [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(false);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate append function', () => {
	const lexer = new Lexer('append [1, 2] [3, 4]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toEqual([1, 2, 3, 4]);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate math utility functions', () => {
	const lexer = new Lexer('abs 5; max 3 7; min 3 7');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(3);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate string utility functions', () => {
	const lexer = new Lexer('concat "hello" " world"; toString 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe('42');
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate if expressions', () => {
	const result = runCode('if True then 1 else 2');
	expect(unwrapValue(result.finalResult)).toBe(1);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate if expressions with false condition', () => {
	const result = runCode('if False then 1 else 2');
	expect(unwrapValue(result.finalResult)).toBe(2);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should evaluate comparison operations', () => {
	const lexer = new Lexer('2 < 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(true);
	expect(result.executionTrace.length).toBe(1);
});

test('Evaluator - should handle undefined variables', () => {
	const lexer = new Lexer('undefined_var');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();

	expect(().toThrow() => {
		evaluator.evaluateProgram(program);
	}, /Undefined variable: undefined_var/);
});

test('Evaluator - should handle type errors in arithmetic', () => {
	const lexer = new Lexer('"hello" + 5');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();

	expect(().toThrow() => {
		evaluator.evaluateProgram(program);
	}, /Cannot add string and number/);
});

test('Evaluator - Recursion - should handle factorial recursion', () => {
	const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 5
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(120);
});

test('Evaluator - Recursion - should handle factorial with 0', () => {
	const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 0
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(1);
});

test('Evaluator - Recursion - should handle factorial with 1', () => {
	const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 1
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(1);
});

test('Evaluator - Recursion - should handle fibonacci recursion', () => {
	const code = `
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 10
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(55);
});

test('Evaluator - Recursion - should handle fibonacci with small values', () => {
	const code = `
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 0; fibonacci 1; fibonacci 2; fibonacci 3
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(2);
});

test('Evaluator - Recursion - should handle recursive list length', () => {
	const code = `
        recLength = fn list => if isEmpty list then 0 else 1 + (recLength (tail list));
        recLength [1, 2, 3, 4, 5]
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(5);
});

test('Evaluator - Recursion - should handle recursive list sum', () => {
	const code = `
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recSum = fn list => if isEmpty list then 0 else (getSome (head list)) + (recSum (tail list));
        recSum [1, 2, 3, 4, 5]
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(15);
});

test('Evaluator - Recursion - should handle recursive list reverse', () => {
	const code = `
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recReverse = fn list => if isEmpty list then [] else append (recReverse (tail list)) [getSome (head list)];
        recReverse [1, 2, 3]
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toEqual([3, 2, 1]);
});

test('Evaluator - Recursion - should handle recursive power function', () => {
	const code = `
        power = fn base exp => if exp == 0 then 1 else base * (power base (exp - 1));
        power 2 8
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(256);
});

test('Evaluator - Recursion - should handle recursive gcd function', () => {
	const code = `
        gcd = fn a b => 
          if a == b then a 
          else if a > b then gcd (a - b) b 
          else gcd a (b - a);
        gcd 48 18
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(6);
});

test('Evaluator - Recursion - should handle recursive function with multiple parameters', () => {
	const code = `
        multiply = fn a b => if b == 0 then 0 else a + (multiply a (b - 1));
        multiply 3 4
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(12);
});

test('Evaluator - Recursion - should handle recursive function in sequence', () => {
	const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        a = factorial 3;
        b = factorial 4;
        a + b
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	expect(unwrapValue(result.finalResult)).toBe(30);
});

test('Evaluator - should evaluate top-level definitions and use them', () => {
	const lexer = new Lexer('addNums = fn x y => x + y; addNums 2 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(5);
});

test('Evaluator - should evaluate basic import', () => {
	const lexer = new Lexer('import "test/test_import"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(42);
});

test('Evaluator - should evaluate single-field record', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate multi-field record (semicolon separated)', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate accessor on record', () => {
	const lexer = new Lexer('user = { @name "Alice", @age 30 }; (@name user)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe('Alice');
});

test('Evaluator - definition with sequence on right side using parentheses', () => {
	const lexer = new Lexer('foo = (1; 2); foo');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(2);
});

test('Evaluator - multiple definitions sequenced', () => {
	const lexer = new Lexer('foo = 1; 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(2);
});

test('Evaluator - should evaluate function with unit parameter', () => {
	const lexer = new Lexer('foo = fn {} => "joe"; foo {}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe('joe');
});

test('Evaluator - should evaluate thrush operator', () => {
	const lexer = new Lexer('10 | (fn x => x + 1)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(11);
});

test('Evaluator - should evaluate chained thrush operators', () => {
	const lexer = new Lexer(
		'[1, 2, 3] | list_map (fn x => x + 1) | list_map (fn x => x * x)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toEqual([4, 9, 16]);
});

test('Evaluator - Top-level sequence evaluation - multiple definitions and final expression', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(3);
});

test('Evaluator - Top-level sequence evaluation - multiple definitions and final record', () => {
	const code = `
        addFunc = fn x y => x + y;
        sub = fn x y => x - y;
        math = { @add addFunc, @sub sub };
        math
      `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	const mathRecord = unwrapValue(result.finalResult) as any;
	expect(expect(mathRecord.add)).toBeTruthy();
	expect(expect(mathRecord.sub)).toBeTruthy();
	expect(mathRecord.add.tag).toBe('function');
	expect(mathRecord.sub.tag).toBe('function');
});

test('Evaluator - Top-level sequence evaluation - sequence with trailing semicolon', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b;');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(unwrapValue(result.finalResult)).toBe(3);
});

test('Evaluator - duck-typed record accessor chain', () => {
	const code = `
      foo = {@bar {@baz fn x => {@qux x}, @extra 42}};
      (((foo | @bar) | @baz) $ 1) | @qux
    `;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(result.finalResult).toEqual({ tag: 'number', value: 1 });
});

function evalNoo(src: string) {
	const lexer = new Lexer(src);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	return evaluator.evaluateProgram(program).finalResult;
}

test('Evaluator - Semicolon sequencing - returns only the rightmost value', () => {
	expect(unwrapValue(evalNoo('1; 2; 3'))).toBe(3);
	expect(unwrapValue(evalNoo('42; "hello"'))).toBe('hello');
});

test('Evaluator - Semicolon sequencing - if-expression in sequence', () => {
	expect(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5'))).toBe(4);
	expect(unwrapValue(evalNoo('1; if 2 > 3 then 4 else 5'))).toBe(5);
	expect(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5; 99'))).toBe(99);
	expect(unwrapValue(evalNoo('if 2 < 3 then 4 else 5; 42'))).toBe(42);
});

test('Evaluator - Semicolon sequencing - definitions in sequence', () => {
	expect(unwrapValue(evalNoo('x = 10; x + 5'))).toBe(15);
	expect(unwrapValue(evalNoo('a = 1; b = 2; a + b'))).toBe(3);
});

test('Evaluator - Semicolon sequencing - complex sequencing', () => {
	expect(
		unwrapValue(evalNoo('x = 1; if x == 1 then 100 else 200; x + 1'))).toBe(2
	);
	expect(
		unwrapValue(evalNoo('x = 1; y = 2; if x < y then x else y; x + y'))).toBe(3
	);
});

function evalIfChain(x: number) {
	const src = `if ${x} == 0 then 0 else if ${x} == 1 then 1 else if ${x} == 2 then 2 else 99`;
	const lexer = new Lexer(src);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	return evaluator.evaluateProgram(program).finalResult;
}

test('Evaluator - If associativity and nesting - returns 0 for x == 0', () => {
	expect(unwrapValue(evalIfChain(0))).toBe(0);
});

test('Evaluator - If associativity and nesting - returns 1 for x == 1', () => {
	expect(unwrapValue(evalIfChain(1))).toBe(1);
});

test('Evaluator - If associativity and nesting - returns 2 for x == 2', () => {
	expect(unwrapValue(evalIfChain(2))).toBe(2);
});

test('Evaluator - If associativity and nesting - returns 99 for x == 3', () => {
	expect(unwrapValue(evalIfChain(3))).toBe(99);
});

test('Evaluator - Local Mutation - should allow defining and mutating a local variable', () => {
	const code = `mut x = 1; mut! x = 42; x`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(result.finalResult.tag).toBe('number');
	if (result.finalResult.tag === 'number') {
		expect(result.finalResult.value).toBe(42);
	}
});

test('Evaluator - Local Mutation - should not affect other variables or outer scope', () => {
	const code = `x = 5; mut y = 10; mut! y = 99; x + y`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(result.finalResult.tag).toBe('number');
	if (result.finalResult.tag === 'number') {
		expect(result.finalResult.value).toBe(5 + 99);
	}
});

test('Evaluator - Local Mutation - should throw if mut! is used on non-mutable variable', () => {
	const code = `x = 1; mut! x = 2`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	expect(() => evaluator.evaluateProgram(program).toThrow(), /Cannot mutate non-mutable variable/);
});

test('Evaluator - Local Mutation - should allow returning a mutable variable value (pass-by-value)', () => {
	const code = `mut x = 7; mut! x = 8; x`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	expect(result.finalResult.tag).toBe('number');
	if (result.finalResult.tag === 'number') {
		expect(result.finalResult.value).toBe(8);
	}
});

test('Evaluator - Additional Coverage - should handle wildcard pattern', () => {
	const result = runCode(`
        value = "anything";
        match value with (
          _ => "wildcard matched"
        )
      `);
	expect(unwrapValue(result.finalResult)).toBe('wildcard matched');
});

test('Evaluator - Additional Coverage - should handle variable pattern with binding', () => {
	const result = runCode(`
        value = 123;
        match value with (
          x => x + 1
        )
      `);
	expect(unwrapValue(result.finalResult)).toBe(124);
});

test('Evaluator - Additional Coverage - should handle constructor pattern matching', () => {
	const result = runCode(`
        type MyType = A | B Float;
        value = B 42;
        match value with (
          A => 0;
          B x => x
        )
      `);
	expect(unwrapValue(result.finalResult)).toBe(42);
});

test('Evaluator - Additional Coverage - should throw error when no pattern matches', () => {
	expect(().toThrow() =>
		runCode(`
        type Color = Red | Blue;
        value = Red;
        match value with (
          Blue => "blue"
        )
      `), /No pattern matched in match expression/);
});

test('Evaluator - Additional Coverage - should convert number to string', () => {
	const result = runCode('toString 42');
	expect(unwrapValue(result.finalResult)).toBe('42');
});

test('Evaluator - Additional Coverage - should convert string to string with quotes', () => {
	const result = runCode('toString "hello"');
	expect(unwrapValue(result.finalResult)).toBe('"hello"');
});

test('Evaluator - Additional Coverage - should convert boolean True to string', () => {
	const result = runCode('toString True');
	expect(unwrapValue(result.finalResult)).toBe('True');
});

test('Evaluator - Additional Coverage - should convert boolean False to string', () => {
	const result = runCode('toString False');
	expect(unwrapValue(result.finalResult)).toBe('False');
});

test('Evaluator - Additional Coverage - should convert list to string', () => {
	const result = runCode('toString [1, 2, 3]');
	expect(unwrapValue(result.finalResult)).toBe('[1; 2; 3]');
});

test('Evaluator - Additional Coverage - should convert tuple to string', () => {
	const result = runCode('toString {1, 2, 3}');
	expect(unwrapValue(result.finalResult)).toBe('{1; 2; 3}');
});

test('Evaluator - Additional Coverage - should convert record to string', () => {
	const result = runCode('toString { @name "Alice", @age 30 }');
	expect(unwrapValue(result.finalResult)).toBe('{@name "Alice"; @age 30}');
});

test('Evaluator - Additional Coverage - should convert unit to string', () => {
	const result = runCode('toString {}');
	expect(unwrapValue(result.finalResult)).toBe('unit');
});

test('Evaluator - Additional Coverage - should convert function to string', () => {
	const result = runCode('toString (fn x => x + 1)');
	expect(unwrapValue(result.finalResult)).toBe('<function>');
});

test('Evaluator - Additional Coverage - should convert constructor without args to string', () => {
	const result = runCode(`
        type Color = Red | Green | Blue;
        toString Red
      `);
	expect(unwrapValue(result.finalResult)).toBe('Red');
});

test('Evaluator - Additional Coverage - should convert constructor with args to string', () => {
	const result = runCode(`
        type Option a = Some a | None;
        toString (Some 42)
      `);
	expect(unwrapValue(result.finalResult)).toBe('Some 42');
});

test('Evaluator - Additional Coverage - should handle abs function', () => {
	const result = runCode('abs (-5)');
	expect(unwrapValue(result.finalResult)).toBe(5);
});

test('Evaluator - Additional Coverage - should handle max function', () => {
	const result = runCode('max 5 10');
	expect(unwrapValue(result.finalResult)).toBe(10);
});

test('Evaluator - Additional Coverage - should handle min function', () => {
	const result = runCode('min 5 10');
	expect(unwrapValue(result.finalResult)).toBe(5);
});

test('Evaluator - Additional Coverage - should handle concat function', () => {
	const result = runCode('concat "hello" " world"');
	expect(unwrapValue(result.finalResult)).toBe('hello world');
});

test('Evaluator - Additional Coverage - should handle hasKey function', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "name"
      `);
	expect(unwrapValue(result.finalResult)).toBe(true);
});

test('Evaluator - Additional Coverage - should handle hasKey with missing key', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "height"
      `);
	expect(unwrapValue(result.finalResult)).toBe(false);
});

test('Evaluator - Additional Coverage - should handle hasValue with missing value', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasValue record 42
      `);
	expect(unwrapValue(result.finalResult)).toBe(false);
});

test('Evaluator - Additional Coverage - should handle randomRange function', () => {
	const result = runCode('randomRange 1 10');
	expect(result.finalResult.tag).toBe('number');
	if (result.finalResult.tag === 'number') {
		expect(expect(result.finalResult.value >= 1)).toBeTruthy();
		expect(expect(result.finalResult.value <= 10)).toBeTruthy();
	}
});

test('Evaluator - Additional Coverage - should handle invalid function application', () => {
	expect(() => runCode('42 5').toThrow());
});

test('Evaluator - Additional Coverage - should handle mutGet error with non-mutable', () => {
	expect(() => runCode('mutGet 42').toThrow(), /mutGet requires a mutable reference/);
});

test('Evaluator - Additional Coverage - should handle mutSet error with non-mutable', () => {
	expect(() => runCode('mutSet 42 100').toThrow(), /mutSet requires a mutable reference/);
});

test('Evaluator - Additional Coverage - should handle nullary constructors', () => {
	const result = runCode(`
        type Color = Red | Green | Blue;
        Red
      `);
	expect(result.finalResult.tag).toBe('constructor');
	if (result.finalResult.tag === 'constructor') {
		expect(result.finalResult.name).toBe('Red');
		expect(result.finalResult.args).toEqual([]);
	}
});

test('Evaluator - Additional Coverage - should handle constructor with arguments', () => {
	const result = runCode(`
        type Point = Point Float Float;
        Point 10 20
      `);
	expect(result.finalResult.tag).toBe('constructor');
	if (result.finalResult.tag === 'constructor') {
		expect(result.finalResult.name).toBe('Point');
		expect(result.finalResult.args.length).toBe(2);
	}
});

test('Evaluator - Additional Coverage - should handle curried constructor application', () => {
	const result = runCode(`
        type Point = Point Float Float;
        partialPoint = Point 10;
        partialPoint 20
      `);
	expect(result.finalResult.tag).toBe('constructor');
	if (result.finalResult.tag === 'constructor') {
		expect(result.finalResult.name).toBe('Point');
		expect(result.finalResult.args.length).toBe(2);
	}
});

test('Evaluator - Additional Coverage - should handle nested scopes with pattern matching', () => {
	const result = runCode(`
        outer = 10;
        value = 42;
        match value with (
          x => x + outer
        )
      `);
	expect(unwrapValue(result.finalResult)).toBe(52);
});

test('Evaluator - Additional Coverage - should handle function scoping', () => {
	const result = runCode(`
        x = 1;
        f = fn y => x + y;
        f 10
      `);
	expect(unwrapValue(result.finalResult)).toBe(11);
});

