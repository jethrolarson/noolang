import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { Evaluator } from '../../evaluator/evaluator';

describe('Show Trait Multiple Implementations', () => {
	const parseTypeAndEvaluate = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		const typeResult = typeProgram(program);
		
		const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
		const evalResult = evaluator.evaluateProgram(program);
		
		return { typeResult, evalResult };
	};

	test('multiple types implementing Show should work fine', () => {
		// This should work - different types implementing the same trait
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow Int ( show = toString );
			implement MyShow String ( show = fn s => "\"" + s + "\"" );
			implement MyShow Bool ( show = fn b => if b then "True" else "False" );
			
			result1 = show 42;
			result2 = show "hello";
			result3 = show True
		`;
		
		const { evalResult } = parseTypeAndEvaluate(code);
		
		console.log('Multiple Show implementations result:', evalResult.finalResult);
		
		// This should work fine - the show function resolves based on argument type
		expect(evalResult.finalResult.tag).toBe('string');
		// The result should be the last expression (show True)
	});

	test('same type implementing Show twice should error', () => {
		// This should error - same type implementing the same trait twice
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow Int ( show = toString );
			implement MyShow Int ( show = fn x => "duplicate" )
		`;
		
		// This should throw an error about duplicate implementation
		expect(() => parseTypeAndEvaluate(code)).toThrow(/duplicate implementation/i);
	});

	test('using Show with different types should resolve correctly', () => {
		// Test that show calls resolve to the correct implementation based on argument type
		const code1 = `
			constraint TestShow a ( show: a -> String );
			implement TestShow Int ( show = toString );
			show 42
		`;
		
		const code2 = `
			constraint TestShow a ( show: a -> String );
			implement TestShow String ( show = fn s => "String: " + s );
			show "hello"
		`;
		
		const result1 = parseTypeAndEvaluate(code1);
		const result2 = parseTypeAndEvaluate(code2);
		
		console.log('Int show result:', result1.evalResult.finalResult);
		console.log('String show result:', result2.evalResult.finalResult);
		
		// Each should resolve to the correct implementation
		expect(result1.evalResult.finalResult.tag).toBe('string');
		expect(result2.evalResult.finalResult.tag).toBe('string');
		expect(result1.evalResult.finalResult.value).toBe('42');
		expect(result2.evalResult.finalResult.value).toBe('String: hello');
	});

	test('conflicting trait function names should error', () => {
		// This should error - same function name in different traits for same type
		const code = `
			constraint Printable a ( display: a -> String );
			constraint Showable a ( display: a -> String );
			implement Printable Int ( display = toString );
			implement Showable Int ( display = fn x => "num: " + toString x );
			
			result = display 42
		`;
		
		// This should error because Int has two implementations of 'display'
		expect(() => parseTypeAndEvaluate(code)).toThrow(/ambiguous function call.*display.*Int/i);
	});

	test('stdlib Show trait works with multiple types', () => {
		// Test the existing stdlib Show implementations
		const code = `
			result1 = show 42;
			result2 = show "hello";
			result3 = show True
		`;
		
		const { evalResult } = parseTypeAndEvaluate(code);
		
		console.log('Stdlib Show result:', evalResult.finalResult);
		
		// The stdlib Show should work for multiple types
		expect(evalResult.finalResult.tag).toBe('string');
	});
});