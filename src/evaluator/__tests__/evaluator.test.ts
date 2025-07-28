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

const evalNoo = (src: string): Value => {
	const lexer = new Lexer(src);
	const tokens = lexer.tokenize();
	const parsed = parse(tokens);
	const decorated = typeAndDecorate(parsed);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(decorated.program);
	return result.finalResult;
};

test('Evaluator - should evaluate literal integers', () => {
	assert.equal(unwrapValue(evalNoo('42')), 42);
});

test('Evaluator - should evaluate literal strings', () => {
	assert.equal(unwrapValue(evalNoo('"hello"')), 'hello');
});

test('Evaluator - should evaluate True literal', () => {
	assert.equal(unwrapValue(evalNoo('True')), true);
});

test('Evaluator - should evaluate False literal', () => {
	assert.equal(unwrapValue(evalNoo('False')), false);
});

test('Evaluator - should evaluate empty list', () => {
	assert.equal(unwrapValue(evalNoo('[]')), []);
});

test('Evaluator - should evaluate list with elements', () => {
	assert.equal(unwrapValue(evalNoo('[1, 2, 3]')), [1, 2, 3]);
});

test('Evaluator - should evaluate unit value', () => {
	const result = evalNoo('{}');
	assert.equal(result.tag, 'unit');
});

test('Evaluator - should evaluate record with fields', () => {
	const result = unwrapValue(evalNoo('{ @name "Alice", @age 30 }'));
	assert.equal(result, { name: 'Alice', age: 30 });
});

test('Evaluator - should evaluate simple addition', () => {
	assert.equal(unwrapValue(evalNoo('1 + 2')), 3);
});

test('Evaluator - should evaluate simple subtraction', () => {
	assert.equal(unwrapValue(evalNoo('5 - 3')), 2);
});

test('Evaluator - should evaluate simple multiplication', () => {
	assert.equal(unwrapValue(evalNoo('3 * 4')), 12);
});

test('Evaluator - should evaluate equality comparison', () => {
	assert.equal(unwrapValue(evalNoo('5 == 5')), true);
	assert.equal(unwrapValue(evalNoo('5 == 3')), false);
});

test('Evaluator - should evaluate inequality comparison', () => {
	assert.equal(unwrapValue(evalNoo('5 != 3')), true);
	assert.equal(unwrapValue(evalNoo('5 != 5')), false);
});

test('Evaluator - should evaluate less than comparison', () => {
	assert.equal(unwrapValue(evalNoo('3 < 5')), true);
	assert.equal(unwrapValue(evalNoo('5 < 3')), false);
});

test('Evaluator - should evaluate greater than comparison', () => {
	assert.equal(unwrapValue(evalNoo('5 > 3')), true);
	assert.equal(unwrapValue(evalNoo('3 > 5')), false);
});

test('Evaluator - should evaluate simple if expressions', () => {
	assert.equal(unwrapValue(evalNoo('if True then 1 else 2')), 1);
	assert.equal(unwrapValue(evalNoo('if False then 1 else 2')), 2);
});

test('Evaluator - should evaluate function definition and application', () => {
	assert.equal(unwrapValue(evalNoo('(fn x => x + 1) 5')), 6);
});

test('Evaluator - should evaluate variable binding', () => {
	assert.equal(unwrapValue(evalNoo('x = 5; x')), 5);
});

test('Evaluator - should evaluate accessor on record', () => {
	assert.equal(unwrapValue(evalNoo('person = { @name "Alice" }; @name person')), 'Alice');
});

test('Evaluator - should evaluate thrush operator', () => {
	assert.equal(unwrapValue(evalNoo('5 | (fn x => x * 2)')), 10);
});

test('Evaluator - should evaluate nested function calls', () => {
	assert.equal(unwrapValue(evalNoo('((fn x => fn y => x + y) 3) 4')), 7);
});

test('Evaluator - should evaluate complex expression with precedence', () => {
	assert.equal(unwrapValue(evalNoo('2 + 3 * 4')), 14);
});

test('Evaluator - should evaluate parenthesized expressions', () => {
	assert.equal(unwrapValue(evalNoo('(2 + 3) * 4')), 20);
});

test('Evaluator - should evaluate string concatenation', () => {
	assert.equal(unwrapValue(evalNoo('"hello" + " world"')), 'hello world');
});

test('Evaluator - should handle nested records', () => {
	const result = unwrapValue(evalNoo('person = { @info { @name "Alice", @age 30 } }; @name (@info person)'));
	assert.equal(result, 'Alice');
});

test('Evaluator - should evaluate pattern matching with Some', () => {
	const result = unwrapValue(evalNoo('match (Some 42) with (Some x => x; None => 0)'));
	assert.equal(result, 42);
});

test('Evaluator - should evaluate pattern matching with None', () => {
	const result = unwrapValue(evalNoo('match None with (Some x => x; None => 0)'));
	assert.equal(result, 0);
});

test('Evaluator - should evaluate ADT constructors', () => {
	const result = unwrapValue(evalNoo('Some 42'));
	assert.equal(result.name, 'Some');
	assert.equal(unwrapValue(result.args[0]), 42);
});

test('Evaluator - should evaluate factorial recursion', () => {
	const result = unwrapValue(evalNoo('factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1)); factorial 5'));
	assert.equal(result, 120);
});

test('Evaluator - should handle top-level sequence evaluation', () => {
	assert.equal(unwrapValue(evalNoo('x = 1; y = 2; x + y')), 3);
});

test('Evaluator - should handle semicolon sequencing', () => {
	assert.equal(unwrapValue(evalNoo('(x = 10; x + 5)')), 15);
});

test('Evaluator - should handle nested if expressions', () => {
	assert.equal(unwrapValue(evalNoo('if True then (if False then 1 else 2) else 3')), 2);
});

test('Evaluator - should handle mutable variables', () => {
	assert.equal(unwrapValue(evalNoo('mut x = 5; x')), 5);
});

test('Evaluator - should handle variable patterns in match', () => {
	const result = unwrapValue(evalNoo('match 42 with (x => x + 1)'));
	assert.equal(result, 43);
});

test('Evaluator - should handle wildcard patterns', () => {
	const result = unwrapValue(evalNoo('match 42 with (_ => 99)'));
	assert.equal(result, 99);
});

test('Evaluator - should handle function with no parameters', () => {
	assert.equal(unwrapValue(evalNoo('getValue = fn x => 42; getValue 1')), 42);
});

test('Evaluator - should handle boolean constructors', () => {
	assert.equal(unwrapValue(evalNoo('True')), true);
	assert.equal(unwrapValue(evalNoo('False')), false);
});

test('Evaluator - should handle complex record access patterns', () => {
	const result = unwrapValue(evalNoo(`
		data = { @a { @b { @c 42 } } };
		getValue = fn record => @c (@b (@a record));
		getValue data
	`));
	assert.equal(result, 42);
});

test('Evaluator - should handle higher-order function composition', () => {
	const result = unwrapValue(evalNoo(`
		compose = fn f g => fn x => f (g x);
		addOne = fn x => x + 1;
		mulTwo = fn x => x * 2;
		combined = compose addOne mulTwo;
		combined 3
	`));
	assert.equal(result, 7);
});

test('Evaluator - should handle conditional with complex expressions', () => {
	assert.equal(unwrapValue(evalNoo('if (3 + 2) > 4 then "yes" else "no"')), 'yes');
});

test('Evaluator - should handle multiple function applications in sequence', () => {
	assert.equal(unwrapValue(evalNoo('f = fn x => x + 1; f (f (f 0))')), 3);
});

test('Evaluator - should handle Record construction with computed values', () => {
	const result = unwrapValue(evalNoo('x = 5; y = 10; { @sum x + y, @product x * y }'));
	assert.equal(result, { sum: 15, product: 50 });
});

test('Evaluator - should handle function returning complex data structures', () => {
	const result = unwrapValue(evalNoo(`
		makeData = fn name age => { @person { @name name, @age age } };
		result = makeData "Alice" 30;
		@name (@person result)
	`));
	assert.equal(result, 'Alice');
});

test('Evaluator - should handle nested function definitions', () => {
	const result = unwrapValue(evalNoo(`
		outer = fn x => (
			inner = fn y => x + y;
			inner 10
		);
		outer 5
	`));
	assert.equal(result, 15);
});

test('Evaluator - should handle error cases gracefully', () => {
	// Test undefined variable access - modify pattern to match actual error
	assert.throws(() => evalNoo('undefinedVariable'), /Undefined variable/);
});

test.run();
