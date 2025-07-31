import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { floatType, stringType, optionType } from '../../ast';
import { Evaluator } from '../../evaluator/evaluator';
import { test, expect } from 'bun:test';
import {
	assertListValue,
	assertNumberValue,
	assertStringValue,
	assertConstructorValue,
} from '../../../test/utils';

const parseTypeAndEvaluate = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	const typeResult = typeAndDecorate(program);

	// Initialize evaluator with the trait registry from type checking
	const evaluator = new Evaluator({
		traitRegistry: typeResult.state.traitRegistry,
	});
	const evalResult = evaluator.evaluateProgram(program);

	return { typeResult, evalResult };
};

// ========================================
// ADD TRAIT IMPLEMENTATIONS
// ========================================

test('Built-in Trait Implementations - Add Trait - Float - should type check Float addition', () => {
	const code = '1.0 + 2.0';
	const { typeResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
});

test('Built-in Trait Implementations - Add Trait - Float - should evaluate Float addition at runtime', () => {
	const code = '1.0 + 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(3);
	}
});

test('Built-in Trait Implementations - Add Trait - Float - should work with integer literals (parsed as Float)', () => {
	const code = '5 + 7';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(12);
	}
});

test('Built-in Trait Implementations - Add Trait - Float - should work with mixed integer and float literals', () => {
	const code = '3 + 4.5';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(7.5);
	}
});

test('Built-in Trait Implementations - Add Trait - String - should type check String addition', () => {
	const code = '"hello" + " world"';
	const { typeResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(stringType());
});

test('Built-in Trait Implementations - Add Trait - String - should evaluate String addition at runtime', () => {
	const code = '"hello" + " world"';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('string');
	if (evalResult.finalResult.tag === 'string') {
		expect(evalResult.finalResult.value).toBe('hello world');
	}
});

test('Built-in Trait Implementations - Add Trait - String - should work with empty strings', () => {
	const code = '"" + "test"';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(stringType());
	expect(evalResult.finalResult.tag).toBe('string');
	if (evalResult.finalResult.tag === 'string') {
		expect(evalResult.finalResult.value).toBe('test');
	}
});

test('Built-in Trait Implementations - Add Trait - Mixed Types - should reject Float + String', () => {
	const code = '1.0 + "hello"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	expect(() => typeAndDecorate(program)).toThrow();
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - SUBTRACT
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Subtract - should type check Float subtraction', () => {
	const code = '10.0 - 3.0';
	const { typeResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
});

test('Built-in Trait Implementations - Numeric Trait - Subtract - should evaluate Float subtraction at runtime', () => {
	const code = '10.0 - 3.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(7);
	}
});

test('Built-in Trait Implementations - Numeric Trait - Subtract - should handle negative results', () => {
	const code = '3.0 - 8.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(-5);
	}
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - MULTIPLY
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Multiply - should type check Float multiplication', () => {
	const code = '4.0 * 2.5';
	const { typeResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
});

test('Built-in Trait Implementations - Numeric Trait - Multiply - should evaluate Float multiplication at runtime', () => {
	const code = '4.0 * 2.5';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(10);
	}
});

test('Built-in Trait Implementations - Numeric Trait - Multiply - should handle zero multiplication', () => {
	const code = '5.0 * 0.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('number');
	if (evalResult.finalResult.tag === 'number') {
		expect(evalResult.finalResult.value).toBe(0);
	}
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - DIVIDE
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Divide - should type check Float division returns Option Float', () => {
	const code = '10.0 / 2.0';
	const { typeResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(optionType(floatType()));
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should evaluate Float division at runtime', () => {
	const code = '10.0 / 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	expect(evalResult.finalResult.tag).toBe('constructor');
	if (evalResult.finalResult.tag === 'constructor') {
		expect(evalResult.finalResult.name).toBe('Some');
		expect(evalResult.finalResult.args.length).toBe(1);
		expect(evalResult.finalResult.args[0]).toEqual({ tag: 'number', value: 5 });
	}
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should handle division by zero', () => {
	const code = '10.0 / 0.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertConstructorValue(evalResult.finalResult);
	expect(evalResult.finalResult.name).toBe('None');
	expect(evalResult.finalResult.args.length).toBe(0);
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should handle fractional results', () => {
	const code = '7.0 / 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertConstructorValue(evalResult.finalResult);
	expect(evalResult.finalResult.name).toBe('Some');
	expect(evalResult.finalResult.args.length).toBe(1);
	assertNumberValue(evalResult.finalResult.args[0]);
	expect(evalResult.finalResult.args[0].value).toBe(3.5);
});

// ========================================
// COMPLEX EXPRESSIONS
// ========================================

test('Built-in Trait Implementations - Complex Expressions - should handle multiple operations', () => {
	const code = '1.0 + 2.0 * 3.0 - 4.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(3);
});

test('Built-in Trait Implementations - Complex Expressions - should work with parentheses', () => {
	const code = '(10.0 + 5.0) * 2.0 - 3.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(27);
});

// ========================================
// HIGHER-ORDER FUNCTIONS
// ========================================

test('Built-in Trait Implementations - Higher-Order Functions - should work with map and addition', () => {
	const code = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values.length).toBe(3);
	assertNumberValue(evalResult.finalResult.values[0]);
	expect(evalResult.finalResult.values[0].value).toBe(2);
	assertNumberValue(evalResult.finalResult.values[1]);
	expect(evalResult.finalResult.values[1].value).toBe(3);
	assertNumberValue(evalResult.finalResult.values[2]);
	expect(evalResult.finalResult.values[2].value).toBe(4);
});

test('Built-in Trait Implementations - Higher-Order Functions - should work with map and multiplication', () => {
	const code = 'map (fn x => x * 2.0) [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertListValue(evalResult.finalResult);
	expect(evalResult.finalResult.values.length).toBe(3);
	assertNumberValue(evalResult.finalResult.values[0]);
	expect(evalResult.finalResult.values[0].value).toBe(2);
	assertNumberValue(evalResult.finalResult.values[1]);
	expect(evalResult.finalResult.values[1].value).toBe(4);
	assertNumberValue(evalResult.finalResult.values[2]);
	expect(evalResult.finalResult.values[2].value).toBe(6);
});

test('Built-in Trait Implementations - Higher-Order Functions - should work with reduce and addition', () => {
	const code = 'reduce (fn acc x => acc + x) 0.0 [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(6);
});

// ========================================
// VARIABLES AND FUNCTION DEFINITIONS
// ========================================

test('Built-in Trait Implementations - Variables - should work with variable addition', () => {
	const code = `
		x = 5.0;
		y = 3.0;
		x + y
	`;
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	expect(typeResult.type).toEqual(floatType());
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(8);
});

test('Built-in Trait Implementations - Function Definitions - should work with function that uses addition', () => {
	const code = `
		add_one = fn x => x + 1.0;
		add_one 5.0
	`;
	const { evalResult } = parseTypeAndEvaluate(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(6);
});

test('Built-in Trait Implementations - Function Definitions - should work with function that uses multiple operations', () => {
	const code = `
		calculate = fn x y => x * 2.0 + y - 1.0;
		calculate 3.0 5.0
	`;
	const { evalResult } = parseTypeAndEvaluate(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(10);
});

// ========================================
// TRAIT IMPLEMENTATION VERIFICATION
// ========================================

test('Built-in Trait Implementations - Built-in Resolution - should resolve Add trait for Float via built-in mechanism', () => {
	const code = '1.0 + 2.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	// Type checking should pass (constraint checking works)
	expect(typeResult.type).toEqual(floatType());

	// Runtime should work (built-in resolution works)
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(3);
});

test('Built-in Trait Implementations - Built-in Resolution - should resolve Add trait for String via built-in mechanism', () => {
	const code = '"hello" + " world"';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	// Type checking should pass (constraint checking works)
	expect(typeResult.type).toEqual(stringType());

	// Runtime should work (built-in resolution works)
	assertStringValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe('hello world');
});

test('Built-in Trait Implementations - Built-in Resolution - should resolve Numeric trait for Float via built-in mechanism', () => {
	const code = '10.0 - 5.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);

	// Type checking should pass (constraint checking works)
	expect(typeResult.type).toEqual(floatType());

	// Runtime should work (built-in resolution works)
	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(5);
});

// ========================================
// EDGE CASES AND ERROR HANDLING
// ========================================

test('Built-in Trait Implementations - Edge Cases - should handle very large numbers', () => {
	const code = '999999.0 + 1.0';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(1000000);
});

test('Built-in Trait Implementations - Edge Cases - should handle very small numbers', () => {
	const code = '0.001 * 0.001';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertNumberValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe(0.000001);
});

test('Built-in Trait Implementations - Edge Cases - should handle string concatenation with special strings', () => {
	const code = '"123" + "456"';
	const { evalResult } = parseTypeAndEvaluate(code);

	assertStringValue(evalResult.finalResult);
	expect(evalResult.finalResult.value).toBe('123456');
});

