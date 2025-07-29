import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate, typeProgram } from '../../src/typer';
import { typeToString } from '../../src/typer/helpers';
import { resetUnificationCounters, logUnificationStats } from '../../src/typer/unify';

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

function evalExpressionWithLogging(source: string, testName: string) {
	resetUnificationCounters();
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	const testEvaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
	const result = testEvaluator.evaluateProgram(decoratedResult.program);
	logUnificationStats(testName);
	return unwrapValue(result.finalResult);
}

function typeCheckExpressionWithLogging(source: string, testName: string) {
	resetUnificationCounters();
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const result = typeProgram(ast);
	logUnificationStats(testName);
	return typeToString(result.type, result.state.substitution);
}

// Test each case individually with detailed logging

test('ENHANCED DEBUG: Simple safe thrush - Some case', () => {
	const result = evalExpressionWithLogging(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
    `, 'Simple Some Case');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 15 }],
	});
});

test('ENHANCED DEBUG: Simple safe thrush - None case', () => {
	const result = evalExpressionWithLogging(`
        add_ten = fn x => x + 10;
        None |? add_ten
    `, 'Simple None Case');
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('ENHANCED DEBUG: Inline function', () => {
	const result = evalExpressionWithLogging(`Some 10 |? (fn x => x * 2)`, 'Inline Function');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 20 }],
	});
});

test('ENHANCED DEBUG: Monadic bind behavior', () => {
	const result = evalExpressionWithLogging(`
        double_wrap = fn x => Some (x * 2);
        Some 5 |? double_wrap
    `, 'Monadic Bind');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 10 }],
	});
});

test('ENHANCED DEBUG: Simple chaining', () => {
	const result = evalExpressionWithLogging(`
        add_one = fn x => x + 1;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? multiply_two
    `, 'Simple Chaining');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('ENHANCED DEBUG: Complex chaining with None', () => {
	const result = evalExpressionWithLogging(`
        add_one = fn x => x + 1;
        to_none = fn x => None;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? to_none |? multiply_two
    `, 'Complex Chaining');
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('ENHANCED DEBUG: Mixed regular and Option functions', () => {
	const result = evalExpressionWithLogging(`
        add_one = fn x => x + 1;
        safe_wrap = fn x => Some (x * 2);
        Some 5 |? add_one |? safe_wrap
    `, 'Mixed Functions');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('ENHANCED DEBUG: Type inference - Option result', () => {
	const type = typeCheckExpressionWithLogging(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
    `, 'Type Inference');
	assert.match(type, /Option/);
});

test('ENHANCED DEBUG: Very complex chaining', () => {
	const result = evalExpressionWithLogging(`
        add_one = fn x => x + 1;
        multiply_two = fn x => x * 2;
        to_some = fn x => Some (x + 10);
        divide_by_two = fn x => x / 2;
        
        # Long chain that might cause exponential type checking
        Some 5 |? add_one |? multiply_two |? to_some |? divide_by_two |? add_one
    `, 'Very Complex Chain');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 9 }],
	});
});

test('ENHANCED DEBUG: Deeply nested operators', () => {
	const result = evalExpressionWithLogging(`
        f1 = fn x => x + 1;
        f2 = fn x => Some (x * 2);
        f3 = fn x => x - 1;
        f4 = fn x => Some (x / 2);
        
        # Nested applications with mixed types
        ((Some 10 |? f1) |? f2) |? f3 |? f4
    `, 'Deeply Nested');
	assert.equal(result, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 10.5 }],
	});
});

test.run();