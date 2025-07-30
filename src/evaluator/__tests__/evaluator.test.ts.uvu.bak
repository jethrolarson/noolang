import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../../typer';
import { Evaluator } from '../evaluator';
import { Value } from '../evaluator';

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
	assert.equal(unwrapValue(result.finalResult), { name: 'Alice', age: 31 });
});

test('Evaluator - should add a new field to a record using set', () => {
	const lexer = new Lexer(
		'user = { @name "Alice" }; user2 = set @age user 42; user2'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), { name: 'Alice', age: 42 });
});

test('Evaluator - set should not mutate the original record', () => {
	const lexer = new Lexer(
		'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user;'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), { name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate number literals', () => {
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), 42);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate string literals', () => {
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), 'hello');
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate boolean literals', () => {
	const result = runCode('True');
	assert.is(unwrapValue(result.finalResult), true);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate arithmetic operations', () => {
	const lexer = new Lexer('2 + 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), 5);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate function definitions and applications', () => {
	const lexer = new Lexer('fn x => x + 1; (fn x => x + 1) 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), 3);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate list operations', () => {
	const lexer = new Lexer('[1, 2, 3] | head');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	const finalResult = unwrapValue(result.finalResult);
	assert.is(finalResult.name, 'Some');
	assert.is(unwrapValue(finalResult.args[0]), 1);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate map function', () => {
	const lexer = new Lexer('list_map (fn x => x * 2) [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.equal(unwrapValue(result.finalResult), [2, 4, 6]);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate filter function', () => {
	const lexer = new Lexer('filter (fn x => x > 2) [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), [3, 4, 5]);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate reduce function', () => {
	const lexer = new Lexer('reduce (fn acc x => acc + x) 0 [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 15);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate length function', () => {
	const lexer = new Lexer('length [1, 2, 3, 4, 5]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), 5);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate isEmpty function', () => {
	const lexer = new Lexer('isEmpty []; isEmpty [1, 2, 3]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), false);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate append function', () => {
	const lexer = new Lexer('append [1, 2] [3, 4]');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.equal(unwrapValue(result.finalResult), [1, 2, 3, 4]);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate math utility functions', () => {
	const lexer = new Lexer('abs 5; max 3 7; min 3 7');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 3);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate string utility functions', () => {
	const lexer = new Lexer('concat "hello" " world"; toString 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), '42');
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate if expressions', () => {
	const result = runCode('if True then 1 else 2');
	assert.is(unwrapValue(result.finalResult), 1);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate if expressions with false condition', () => {
	const result = runCode('if False then 1 else 2');
	assert.is(unwrapValue(result.finalResult), 2);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should evaluate comparison operations', () => {
	const lexer = new Lexer('2 < 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);

	assert.is(unwrapValue(result.finalResult), true);
	assert.is(result.executionTrace.length, 1);
});

test('Evaluator - should handle undefined variables', () => {
	const lexer = new Lexer('undefined_var');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();

	assert.throws(() => {
		evaluator.evaluateProgram(program);
	}, /Undefined variable: undefined_var/);
});

test('Evaluator - should handle type errors in arithmetic', () => {
	const lexer = new Lexer('"hello" + 5');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();

	assert.throws(() => {
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

	assert.is(unwrapValue(result.finalResult), 120);
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

	assert.is(unwrapValue(result.finalResult), 1);
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

	assert.is(unwrapValue(result.finalResult), 1);
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

	assert.is(unwrapValue(result.finalResult), 55);
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

	assert.is(unwrapValue(result.finalResult), 2);
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

	assert.is(unwrapValue(result.finalResult), 5);
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

	assert.is(unwrapValue(result.finalResult), 15);
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

	assert.equal(unwrapValue(result.finalResult), [3, 2, 1]);
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

	assert.is(unwrapValue(result.finalResult), 256);
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

	assert.is(unwrapValue(result.finalResult), 6);
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

	assert.is(unwrapValue(result.finalResult), 12);
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

	assert.is(unwrapValue(result.finalResult), 30);
});

test('Evaluator - should evaluate top-level definitions and use them', () => {
	const lexer = new Lexer('addNums = fn x y => x + y; addNums 2 3');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 5);
});

test('Evaluator - should evaluate basic import', () => {
	const lexer = new Lexer('import "test/test_import"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 42);
});

test('Evaluator - should evaluate single-field record', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), { name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate multi-field record (semicolon separated)', () => {
	const lexer = new Lexer('{ @name "Alice", @age 30 }');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), { name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate accessor on record', () => {
	const lexer = new Lexer('user = { @name "Alice", @age 30 }; (@name user)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 'Alice');
});

test('Evaluator - definition with sequence on right side using parentheses', () => {
	const lexer = new Lexer('foo = (1; 2); foo');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 2);
});

test('Evaluator - multiple definitions sequenced', () => {
	const lexer = new Lexer('foo = 1; 2');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 2);
});

test('Evaluator - should evaluate function with unit parameter', () => {
	const lexer = new Lexer('foo = fn {} => "joe"; foo {}');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 'joe');
});

test('Evaluator - should evaluate thrush operator', () => {
	const lexer = new Lexer('10 | (fn x => x + 1)');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 11);
});

test('Evaluator - should evaluate chained thrush operators', () => {
	const lexer = new Lexer(
		'[1, 2, 3] | list_map (fn x => x + 1) | list_map (fn x => x * x)'
	);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.equal(unwrapValue(result.finalResult), [4, 9, 16]);
});

test('Evaluator - Top-level sequence evaluation - multiple definitions and final expression', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 3);
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
	assert.ok(mathRecord.add);
	assert.ok(mathRecord.sub);
	assert.is(mathRecord.add.tag, 'function');
	assert.is(mathRecord.sub.tag, 'function');
});

test('Evaluator - Top-level sequence evaluation - sequence with trailing semicolon', () => {
	const lexer = new Lexer('a = 1; b = 2; a + b;');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(unwrapValue(result.finalResult), 3);
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
	assert.equal(result.finalResult, { tag: 'number', value: 1 });
});

function evalNoo(src: string) {
	const lexer = new Lexer(src);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	return evaluator.evaluateProgram(program).finalResult;
}

test('Evaluator - Semicolon sequencing - returns only the rightmost value', () => {
	assert.is(unwrapValue(evalNoo('1; 2; 3')), 3);
	assert.is(unwrapValue(evalNoo('42; "hello"')), 'hello');
});

test('Evaluator - Semicolon sequencing - if-expression in sequence', () => {
	assert.is(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5')), 4);
	assert.is(unwrapValue(evalNoo('1; if 2 > 3 then 4 else 5')), 5);
	assert.is(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5; 99')), 99);
	assert.is(unwrapValue(evalNoo('if 2 < 3 then 4 else 5; 42')), 42);
});

test('Evaluator - Semicolon sequencing - definitions in sequence', () => {
	assert.is(unwrapValue(evalNoo('x = 10; x + 5')), 15);
	assert.is(unwrapValue(evalNoo('a = 1; b = 2; a + b')), 3);
});

test('Evaluator - Semicolon sequencing - complex sequencing', () => {
	assert.is(
		unwrapValue(evalNoo('x = 1; if x == 1 then 100 else 200; x + 1')),
		2
	);
	assert.is(
		unwrapValue(evalNoo('x = 1; y = 2; if x < y then x else y; x + y')),
		3
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
	assert.is(unwrapValue(evalIfChain(0)), 0);
});

test('Evaluator - If associativity and nesting - returns 1 for x == 1', () => {
	assert.is(unwrapValue(evalIfChain(1)), 1);
});

test('Evaluator - If associativity and nesting - returns 2 for x == 2', () => {
	assert.is(unwrapValue(evalIfChain(2)), 2);
});

test('Evaluator - If associativity and nesting - returns 99 for x == 3', () => {
	assert.is(unwrapValue(evalIfChain(3)), 99);
});

test('Evaluator - Local Mutation - should allow defining and mutating a local variable', () => {
	const code = `mut x = 1; mut! x = 42; x`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(result.finalResult.tag, 'number');
	if (result.finalResult.tag === 'number') {
		assert.is(result.finalResult.value, 42);
	}
});

test('Evaluator - Local Mutation - should not affect other variables or outer scope', () => {
	const code = `x = 5; mut y = 10; mut! y = 99; x + y`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(result.finalResult.tag, 'number');
	if (result.finalResult.tag === 'number') {
		assert.is(result.finalResult.value, 5 + 99);
	}
});

test('Evaluator - Local Mutation - should throw if mut! is used on non-mutable variable', () => {
	const code = `x = 1; mut! x = 2`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	assert.throws(() => evaluator.evaluateProgram(program), /Cannot mutate non-mutable variable/);
});

test('Evaluator - Local Mutation - should allow returning a mutable variable value (pass-by-value)', () => {
	const code = `mut x = 7; mut! x = 8; x`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	assert.is(result.finalResult.tag, 'number');
	if (result.finalResult.tag === 'number') {
		assert.is(result.finalResult.value, 8);
	}
});

test('Evaluator - Additional Coverage - should handle wildcard pattern', () => {
	const result = runCode(`
        value = "anything";
        match value with (
          _ => "wildcard matched"
        )
      `);
	assert.is(unwrapValue(result.finalResult), 'wildcard matched');
});

test('Evaluator - Additional Coverage - should handle variable pattern with binding', () => {
	const result = runCode(`
        value = 123;
        match value with (
          x => x + 1
        )
      `);
	assert.is(unwrapValue(result.finalResult), 124);
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
	assert.is(unwrapValue(result.finalResult), 42);
});

test('Evaluator - Additional Coverage - should throw error when no pattern matches', () => {
	assert.throws(() =>
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
	assert.is(unwrapValue(result.finalResult), '42');
});

test('Evaluator - Additional Coverage - should convert string to string with quotes', () => {
	const result = runCode('toString "hello"');
	assert.is(unwrapValue(result.finalResult), '"hello"');
});

test('Evaluator - Additional Coverage - should convert boolean True to string', () => {
	const result = runCode('toString True');
	assert.is(unwrapValue(result.finalResult), 'True');
});

test('Evaluator - Additional Coverage - should convert boolean False to string', () => {
	const result = runCode('toString False');
	assert.is(unwrapValue(result.finalResult), 'False');
});

test('Evaluator - Additional Coverage - should convert list to string', () => {
	const result = runCode('toString [1, 2, 3]');
	assert.is(unwrapValue(result.finalResult), '[1; 2; 3]');
});

test('Evaluator - Additional Coverage - should convert tuple to string', () => {
	const result = runCode('toString {1, 2, 3}');
	assert.is(unwrapValue(result.finalResult), '{1; 2; 3}');
});

test('Evaluator - Additional Coverage - should convert record to string', () => {
	const result = runCode('toString { @name "Alice", @age 30 }');
	assert.is(unwrapValue(result.finalResult), '{@name "Alice"; @age 30}');
});

test('Evaluator - Additional Coverage - should convert unit to string', () => {
	const result = runCode('toString {}');
	assert.is(unwrapValue(result.finalResult), 'unit');
});

test('Evaluator - Additional Coverage - should convert function to string', () => {
	const result = runCode('toString (fn x => x + 1)');
	assert.is(unwrapValue(result.finalResult), '<function>');
});

test('Evaluator - Additional Coverage - should convert constructor without args to string', () => {
	const result = runCode(`
        type Color = Red | Green | Blue;
        toString Red
      `);
	assert.is(unwrapValue(result.finalResult), 'Red');
});

test('Evaluator - Additional Coverage - should convert constructor with args to string', () => {
	const result = runCode(`
        type Option a = Some a | None;
        toString (Some 42)
      `);
	assert.is(unwrapValue(result.finalResult), 'Some 42');
});

test('Evaluator - Additional Coverage - should handle abs function', () => {
	const result = runCode('abs (-5)');
	assert.is(unwrapValue(result.finalResult), 5);
});

test('Evaluator - Additional Coverage - should handle max function', () => {
	const result = runCode('max 5 10');
	assert.is(unwrapValue(result.finalResult), 10);
});

test('Evaluator - Additional Coverage - should handle min function', () => {
	const result = runCode('min 5 10');
	assert.is(unwrapValue(result.finalResult), 5);
});

test('Evaluator - Additional Coverage - should handle concat function', () => {
	const result = runCode('concat "hello" " world"');
	assert.is(unwrapValue(result.finalResult), 'hello world');
});

test('Evaluator - Additional Coverage - should handle hasKey function', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "name"
      `);
	assert.is(unwrapValue(result.finalResult), true);
});

test('Evaluator - Additional Coverage - should handle hasKey with missing key', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasKey record "height"
      `);
	assert.is(unwrapValue(result.finalResult), false);
});

test('Evaluator - Additional Coverage - should handle hasValue with missing value', () => {
	const result = runCode(`
        record = { @name "Alice", @age 30 };
        hasValue record 42
      `);
	assert.is(unwrapValue(result.finalResult), false);
});

test('Evaluator - Additional Coverage - should handle randomRange function', () => {
	const result = runCode('randomRange 1 10');
	assert.is(result.finalResult.tag, 'number');
	if (result.finalResult.tag === 'number') {
		assert.ok(result.finalResult.value >= 1);
		assert.ok(result.finalResult.value <= 10);
	}
});

test('Evaluator - Additional Coverage - should handle invalid function application', () => {
	assert.throws(() => runCode('42 5'));
});

test('Evaluator - Additional Coverage - should handle mutGet error with non-mutable', () => {
	assert.throws(() => runCode('mutGet 42'), /mutGet requires a mutable reference/);
});

test('Evaluator - Additional Coverage - should handle mutSet error with non-mutable', () => {
	assert.throws(() => runCode('mutSet 42 100'), /mutSet requires a mutable reference/);
});

test('Evaluator - Additional Coverage - should handle nullary constructors', () => {
	const result = runCode(`
        type Color = Red | Green | Blue;
        Red
      `);
	assert.is(result.finalResult.tag, 'constructor');
	if (result.finalResult.tag === 'constructor') {
		assert.is(result.finalResult.name, 'Red');
		assert.equal(result.finalResult.args, []);
	}
});

test('Evaluator - Additional Coverage - should handle constructor with arguments', () => {
	const result = runCode(`
        type Point = Point Float Float;
        Point 10 20
      `);
	assert.is(result.finalResult.tag, 'constructor');
	if (result.finalResult.tag === 'constructor') {
		assert.is(result.finalResult.name, 'Point');
		assert.is(result.finalResult.args.length, 2);
	}
});

test('Evaluator - Additional Coverage - should handle curried constructor application', () => {
	const result = runCode(`
        type Point = Point Float Float;
        partialPoint = Point 10;
        partialPoint 20
      `);
	assert.is(result.finalResult.tag, 'constructor');
	if (result.finalResult.tag === 'constructor') {
		assert.is(result.finalResult.name, 'Point');
		assert.is(result.finalResult.args.length, 2);
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
	assert.is(unwrapValue(result.finalResult), 52);
});

test('Evaluator - Additional Coverage - should handle function scoping', () => {
	const result = runCode(`
        x = 1;
        f = fn y => x + y;
        f 10
      `);
	assert.is(unwrapValue(result.finalResult), 11);
});

test.run();
