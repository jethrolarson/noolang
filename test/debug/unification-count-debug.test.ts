import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate, typeProgram } from '../../src/typer';
import { typeToString } from '../../src/typer/helpers';

function unwrapValue(val: Value): any {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
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

function evalExpression(source: string) {
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	const testEvaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
	const result = testEvaluator.evaluateProgram(decoratedResult.program);
	return unwrapValue(result.finalResult);
}

function typeCheckExpression(source: string) {
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const result = typeProgram(ast);
	return typeToString(result.type, result.state.substitution);
}

// Test each case individually to see which one has high unification counts

test('DEBUG: Simple safe thrush - Some case', () => {
	const result = evalExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 15 }],
	});
});

test('DEBUG: Simple safe thrush - None case', () => {
	const result = evalExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('DEBUG: Inline function', () => {
	const result = evalExpression(`Some 10 |? (fn x => x * 2)`);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 20 }],
	});
});

test('DEBUG: Monadic bind behavior', () => {
	const result = evalExpression(`
        double_wrap = fn x => Some (x * 2);
        Some 5 |? double_wrap
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 10 }],
	});
});

test('DEBUG: Function returning None', () => {
	const result = evalExpression(`
        always_none = fn x => None;
        Some 10 |? always_none
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('DEBUG: No double-wrapping', () => {
	const result = evalExpression(`
        wrap_some = fn x => Some (x + 1);
        Some 5 |? wrap_some
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 6 }],
	});
});

test('DEBUG: Simple chaining', () => {
	const result = evalExpression(`
        add_one = fn x => x + 1;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? multiply_two
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('DEBUG: Chain with None short-circuit', () => {
	const result = evalExpression(`
        add_one = fn x => x + 1;
        to_none = fn x => None;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? to_none |? multiply_two
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('DEBUG: Mixed regular and Option functions', () => {
	const result = evalExpression(`
        add_one = fn x => x + 1;
        safe_wrap = fn x => Some (x * 2);
        Some 5 |? add_one |? safe_wrap
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('DEBUG: Type inference - Option result', () => {
	const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
    `);
	assert.match(type, /Option/);
});

test('DEBUG: Type inference - None handling', () => {
	const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
    `);
	assert.match(type, /Option/);
});

test('DEBUG: Error case - non-function operand', () => {
	assert.throws(() => {
		evalExpression(`Some 5 |? 10`);
	});
});

test.run();