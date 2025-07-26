import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { Evaluator } from '../../evaluator/evaluator';
import { assertListValue, assertNumberValue, assertConstrainedType } from '../../../test/utils';

describe('Trait System Evaluation Test', () => {
	const parseTypeAndEvaluate = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		const typeResult = typeProgram(program);
		
		// Also evaluate the expression to see if it actually works
		const evaluator = new Evaluator({ traitRegistry: typeResult.state.traitRegistry });
		const evalResult = evaluator.evaluateProgram(program);
		
		return { typeResult, evalResult };
	};

	test('should evaluate map with list successfully', () => {
		// Test the actual functionality - can we evaluate map (fn x => x + 1) [1,2,3]?
		const code = `map (fn x => x + 1) [1, 2, 3]`;
		
		const { typeResult, evalResult } = parseTypeAndEvaluate(code);
		
		// Type result and evaluation result verified
		
		// If Phase 3 is complete, this should actually work
		assertListValue(evalResult.finalResult);
		expect(evalResult.finalResult.values).toHaveLength(3);
		expect(evalResult.finalResult.values[0]).toEqual({ tag: 'number', value: 2 });
		expect(evalResult.finalResult.values[1]).toEqual({ tag: 'number', value: 3 });
		expect(evalResult.finalResult.values[2]).toEqual({ tag: 'number', value: 4 });
	});

	test('should work with custom trait function', () => {
		// Test a custom trait function to see if it evaluates correctly
		const code = `
			constraint TestMapper f ( testMap: (a -> b) -> f a -> f b );
			implement TestMapper List ( testMap = fn f list => list_map f list );
			testMap (fn x => x * 2) [1, 2, 3]
		`;
		
		const { typeResult, evalResult } = parseTypeAndEvaluate(code);
		
		// Custom trait type result and evaluation result verified
		
		// This should also work if constraint resolution is functional
		assertListValue(evalResult.finalResult);
		expect(evalResult.finalResult.values).toHaveLength(3);
		expect(evalResult.finalResult.values[0]).toEqual({ tag: 'number', value: 2 });
		expect(evalResult.finalResult.values[1]).toEqual({ tag: 'number', value: 4 });
		expect(evalResult.finalResult.values[2]).toEqual({ tag: 'number', value: 6 });
	});

	test('should compare direct list_map vs trait map', () => {
		// Compare direct builtin call vs trait function call
		const code1 = `list_map (fn x => x + 10) [1, 2, 3]`;
		const code2 = `map (fn x => x + 10) [1, 2, 3]`;
		
		const result1 = parseTypeAndEvaluate(code1);
		const result2 = parseTypeAndEvaluate(code2);
		
		// Both evaluations verified
		
		// Both should produce the same result
		expect(result1.evalResult.finalResult).toEqual(result2.evalResult.finalResult);
		
		// Both should be [11, 12, 13]
		expect(result1.evalResult.finalResult.tag).toBe('list');
		expect(result2.evalResult.finalResult.tag).toBe('list');
		
		if (result1.evalResult.finalResult.tag === 'list' && result2.evalResult.finalResult.tag === 'list') {
			expect(result1.evalResult.finalResult.values).toEqual([
				{ tag: 'number', value: 11 },
				{ tag: 'number', value: 12 },
				{ tag: 'number', value: 13 }
			]);
			expect(result2.evalResult.finalResult.values).toEqual(result1.evalResult.finalResult.values);
		}
	});
});