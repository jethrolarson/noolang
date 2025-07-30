import { Evaluator, Value } from '../../../src/evaluator/evaluator';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate, typeProgram } from '../../../src/typer';
import { typeToString } from '../../../src/typer/helpers';
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

// Test suite: Safe Thrush Operator (|?)
let evaluator: Evaluator;

function evalExpression(source: string) {
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	// Create evaluator with trait registry from type checking
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

// Setup function (was beforeEach)
const setup = () => {
	// This evaluator is not used in evalExpression anymore, but keeping for compatibility
	evaluator = new Evaluator();
};

// Test suite: Basic Functionality
test('should apply function to Some value', () => {
	setup();
	const result = evalExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 15 }],
	});
});

test('should short-circuit on None', () => {
	setup();
	const result = evalExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should work with inline function', () => {
	setup();
	const result = evalExpression(`Some 10 |? (fn x => x * 2)`);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 20 }],
	});
});

// Test suite: Monadic Bind Behavior
test('should handle function returning Option (monadic bind)', () => {
	setup();
	const result = evalExpression(`
        double_wrap = fn x => Some (x * 2);
        Some 5 |? double_wrap
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 10 }],
	});
});

test('should return None when function returns None', () => {
	setup();
	const result = evalExpression(`
        always_none = fn x => None;
        Some 10 |? always_none
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should not double-wrap Option results', () => {
	setup();
	const result = evalExpression(`
        wrap_some = fn x => Some (x + 1);
        Some 5 |? wrap_some
      `);
	// Result should be Some 6, not Some (Some 6)
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 6 }],
	});
});

// Test suite: Chaining
test('should support chaining multiple |? operations', () => {
	setup();
	const result = evalExpression(`
        add_one = fn x => x + 1;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? multiply_two
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

test('should short-circuit in chains when None encountered', () => {
	setup();
	const result = evalExpression(`
        add_one = fn x => x + 1;
        to_none = fn x => None;
        multiply_two = fn x => x * 2;
        Some 5 |? add_one |? to_none |? multiply_two
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('should work with mixed regular and Option-returning functions', () => {
	setup();
	const result = evalExpression(`
        add_one = fn x => x + 1;
        safe_wrap = fn x => Some (x * 2);
        Some 5 |? add_one |? safe_wrap
      `);
	expect(result).toEqual({
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 12 }],
	});
});

// Test suite: Type Checking
test('should infer Option type for result', () => {
	setup();
	const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
	expect(type).toMatch(/Option/);
});

test('should handle None type correctly', () => {
	setup();
	const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
	expect(type).toMatch(/Option/);
});

// Test suite: Error Cases
test('should require right operand to be a function', () => {
	setup();
	expect(() => {
		evalExpression(`Some 5 |? 10`);
	}).toThrow();
});

