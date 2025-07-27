import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { floatType, stringType, optionType } from '../../ast';
import { Evaluator } from '../../evaluator/evaluator';

const parseTypeAndEvaluate = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const typeResult = typeAndDecorate(program);
	
	// Initialize evaluator with the trait registry from type checking
	const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
	const evalResult = evaluator.evaluateProgram(program);
	
	return { typeResult, evalResult };
};

// ========================================
// ADD TRAIT IMPLEMENTATIONS
// ========================================

test('Built-in Trait Implementations - Add Trait - Float - should type check Float addition', () => {
	const code = '1.0 + 2.0';
	const { typeResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
});

test('Built-in Trait Implementations - Add Trait - Float - should evaluate Float addition at runtime', () => {
	const code = '1.0 + 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 3);
	}
});

test('Built-in Trait Implementations - Add Trait - Float - should work with integer literals (parsed as Float)', () => {
	const code = '5 + 7';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 12);
	}
});

test('Built-in Trait Implementations - Add Trait - Float - should work with mixed integer and float literals', () => {
	const code = '3 + 4.5';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 7.5);
	}
});

test('Built-in Trait Implementations - Add Trait - String - should type check String addition', () => {
	const code = '"hello" + " world"';
	const { typeResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, stringType());
});

test('Built-in Trait Implementations - Add Trait - String - should evaluate String addition at runtime', () => {
	const code = '"hello" + " world"';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'string');
	if (evalResult.finalResult.tag === 'string') {
		assert.is(evalResult.finalResult.value, 'hello world');
	}
});

test('Built-in Trait Implementations - Add Trait - String - should work with empty strings', () => {
	const code = '"" + "test"';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, stringType());
	assert.is(evalResult.finalResult.tag, 'string');
	if (evalResult.finalResult.tag === 'string') {
		assert.is(evalResult.finalResult.value, 'test');
	}
});

test('Built-in Trait Implementations - Add Trait - Mixed Types - should reject Float + String', () => {
	const code = '1.0 + "hello"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	assert.throws(() => typeAndDecorate(program), /type mismatch|Expected.*Float.*Got.*String/i);
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - SUBTRACT
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Subtract - should type check Float subtraction', () => {
	const code = '10.0 - 3.0';
	const { typeResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
});

test('Built-in Trait Implementations - Numeric Trait - Subtract - should evaluate Float subtraction at runtime', () => {
	const code = '10.0 - 3.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 7);
	}
});

test('Built-in Trait Implementations - Numeric Trait - Subtract - should handle negative results', () => {
	const code = '3.0 - 8.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, -5);
	}
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - MULTIPLY
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Multiply - should type check Float multiplication', () => {
	const code = '4.0 * 2.5';
	const { typeResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
});

test('Built-in Trait Implementations - Numeric Trait - Multiply - should evaluate Float multiplication at runtime', () => {
	const code = '4.0 * 2.5';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 10);
	}
});

test('Built-in Trait Implementations - Numeric Trait - Multiply - should handle zero multiplication', () => {
	const code = '5.0 * 0.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 0);
	}
});

// ========================================
// NUMERIC TRAIT IMPLEMENTATIONS - DIVIDE
// ========================================

test('Built-in Trait Implementations - Numeric Trait - Divide - should type check Float division returns Option Float', () => {
	const code = '10.0 / 2.0';
	const { typeResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, optionType(floatType()));
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should evaluate Float division at runtime', () => {
	const code = '10.0 / 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'constructor');
	if (evalResult.finalResult.tag === 'constructor') {
		assert.is(evalResult.finalResult.name, 'Some');
		assert.is(evalResult.finalResult.args.length, 1);
		assert.equal(evalResult.finalResult.args[0], { tag: 'number', value: 5 });
	}
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should handle division by zero', () => {
	const code = '10.0 / 0.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'constructor');
	if (evalResult.finalResult.tag === 'constructor') {
		assert.is(evalResult.finalResult.name, 'None');
		assert.is(evalResult.finalResult.args.length, 0);
	}
});

test('Built-in Trait Implementations - Numeric Trait - Divide - should handle fractional results', () => {
	const code = '7.0 / 2.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'constructor');
	if (evalResult.finalResult.tag === 'constructor') {
		assert.is(evalResult.finalResult.name, 'Some');
		assert.is(evalResult.finalResult.args.length, 1);
		assert.equal(evalResult.finalResult.args[0], { tag: 'number', value: 3.5 });
	}
});

// ========================================
// COMPLEX EXPRESSIONS
// ========================================

test('Built-in Trait Implementations - Complex Expressions - should handle multiple operations', () => {
	const code = '1.0 + 2.0 * 3.0 - 4.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		// Expected: 1 + (2 * 3) - 4 = 1 + 6 - 4 = 3
		assert.is(evalResult.finalResult.value, 3);
	}
});

test('Built-in Trait Implementations - Complex Expressions - should work with parentheses', () => {
	const code = '(10.0 + 5.0) * 2.0 - 3.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	assert.equal(typeResult.finalType, floatType());
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		// Expected: (10 + 5) * 2 - 3 = 15 * 2 - 3 = 30 - 3 = 27
		assert.is(evalResult.finalResult.value, 27);
	}
});

// ========================================
// HIGHER-ORDER FUNCTIONS
// ========================================

test('Built-in Trait Implementations - Higher-Order Functions - should work with map and addition', () => {
	const code = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'list');
	if (evalResult.finalResult.tag === 'list') {
		assert.is(evalResult.finalResult.values.length, 3);
		assert.equal(evalResult.finalResult.values[0], { tag: 'number', value: 2 });
		assert.equal(evalResult.finalResult.values[1], { tag: 'number', value: 3 });
		assert.equal(evalResult.finalResult.values[2], { tag: 'number', value: 4 });
	}
});

test('Built-in Trait Implementations - Higher-Order Functions - should work with map and multiplication', () => {
	const code = 'map (fn x => x * 2.0) [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'list');
	if (evalResult.finalResult.tag === 'list') {
		assert.is(evalResult.finalResult.values.length, 3);
		assert.equal(evalResult.finalResult.values[0], { tag: 'number', value: 2 });
		assert.equal(evalResult.finalResult.values[1], { tag: 'number', value: 4 });
		assert.equal(evalResult.finalResult.values[2], { tag: 'number', value: 6 });
	}
});

test('Built-in Trait Implementations - Higher-Order Functions - should work with reduce and addition', () => {
	const code = 'reduce (fn acc x => acc + x) 0.0 [1.0, 2.0, 3.0]';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 6);
	}
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
	
	assert.equal(typeResult.finalType, floatType());
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 8);
	}
});

test('Built-in Trait Implementations - Function Definitions - should work with function that uses addition', () => {
	const code = `
		add_one = fn x => x + 1.0;
		add_one 5.0
	`;
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 6);
	}
});

test('Built-in Trait Implementations - Function Definitions - should work with function that uses multiple operations', () => {
	const code = `
		calculate = fn x y => x * 2.0 + y - 1.0;
		calculate 3.0 5.0
	`;
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		// Expected: 3 * 2 + 5 - 1 = 6 + 5 - 1 = 10
		assert.is(evalResult.finalResult.value, 10);
	}
});

// ========================================
// TRAIT IMPLEMENTATION VERIFICATION
// ========================================

test('Built-in Trait Implementations - Built-in Resolution - should resolve Add trait for Float via built-in mechanism', () => {
	const code = '1.0 + 2.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	// Type checking should pass (constraint checking works)
	assert.equal(typeResult.finalType, floatType());
	
	// Runtime should work (built-in resolution works)
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 3);
	}
});

test('Built-in Trait Implementations - Built-in Resolution - should resolve Add trait for String via built-in mechanism', () => {
	const code = '"hello" + " world"';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	// Type checking should pass (constraint checking works)
	assert.equal(typeResult.finalType, stringType());
	
	// Runtime should work (built-in resolution works)
	assert.is(evalResult.finalResult.tag, 'string');
	if (evalResult.finalResult.tag === 'string') {
		assert.is(evalResult.finalResult.value, 'hello world');
	}
});

test('Built-in Trait Implementations - Built-in Resolution - should resolve Numeric trait for Float via built-in mechanism', () => {
	const code = '10.0 - 5.0';
	const { typeResult, evalResult } = parseTypeAndEvaluate(code);
	
	// Type checking should pass (constraint checking works)
	assert.equal(typeResult.finalType, floatType());
	
	// Runtime should work (built-in resolution works)
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 5);
	}
});

// ========================================
// EDGE CASES AND ERROR HANDLING
// ========================================

test('Built-in Trait Implementations - Edge Cases - should handle very large numbers', () => {
	const code = '999999.0 + 1.0';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 1000000);
	}
});

test('Built-in Trait Implementations - Edge Cases - should handle very small numbers', () => {
	const code = '0.001 * 0.001';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'number');
	if (evalResult.finalResult.tag === 'number') {
		assert.is(evalResult.finalResult.value, 0.000001);
	}
});

test('Built-in Trait Implementations - Edge Cases - should handle string concatenation with special strings', () => {
	const code = '"123" + "456"';
	const { evalResult } = parseTypeAndEvaluate(code);
	
	assert.is(evalResult.finalResult.tag, 'string');
	if (evalResult.finalResult.tag === 'string') {
		assert.is(evalResult.finalResult.value, '123456');
	}
});

test.run();