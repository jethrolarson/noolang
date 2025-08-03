import { test, expect, describe } from 'bun:test';
import { assertListValue, runCode } from '../../../test/utils';
import {
	createList,
	createNumber,
	createString,
} from '../../evaluator/evaluator-utils';

describe('Trait System Evaluation', () => {
	test('map should work with unary trait functions', () => {
		const result = runCode('map show [1, 2, 3]');
		expect(result.evalResult.finalResult).toEqual(
			createList([createString('1'), createString('2'), createString('3')])
		);
	});

	test('should evaluate map with list successfully', () => {
		// Test the actual functionality - can we evaluate map (fn x => x + 1) [1,2,3]?
		const code = `map (fn x => x + 1) [1, 2, 3]`;

		const { evalResult } = runCode(code);

		// Type result and evaluation result verified

		// If Phase 3 is complete, this should actually work
		assertListValue(evalResult.finalResult);
		expect(evalResult.finalResult.values.length).toBe(3);
		expect(evalResult.finalResult.values[0]).toEqual(createNumber(2));
		expect(evalResult.finalResult.values[1]).toEqual(createNumber(3));
		expect(evalResult.finalResult.values[2]).toEqual(createNumber(4));
	});

	test('should work with custom trait function', () => {
		// Test a custom trait function to see if it evaluates correctly
		const code = `
		constraint TestMapper f ( testMap: (a -> b) -> f a -> f b );
		implement TestMapper List ( testMap = fn f list => list_map f list );
		testMap (fn x => x * 2) [1, 2, 3]
	`;

		const { evalResult } = runCode(code);

		// Custom trait type result and evaluation result verified

		// This should also work if constraint resolution is functional
		assertListValue(evalResult.finalResult);
		expect(evalResult.finalResult.values.length).toBe(3);
		expect(evalResult.finalResult.values[0]).toEqual(createNumber(2));
		expect(evalResult.finalResult.values[1]).toEqual(createNumber(4));
		expect(evalResult.finalResult.values[2]).toEqual(createNumber(6));
	});

	test('should compare direct list_map vs trait map', () => {
		// Compare direct builtin call vs trait function call
		const code1 = `list_map (fn x => x + 10) [1, 2, 3]`;
		const code2 = `map (fn x => x + 10) [1, 2, 3]`;

		const result1 = runCode(code1);
		const result2 = runCode(code2);

		// Both evaluations verified

		// Both should produce the same result
		expect(result1.evalResult.finalResult).toEqual(
			result2.evalResult.finalResult
		);

		// Both should be [11, 12, 13]
		assertListValue(result1.evalResult.finalResult);
		assertListValue(result2.evalResult.finalResult);

		if (
			result1.evalResult.finalResult.tag === 'list' &&
			result2.evalResult.finalResult.tag === 'list'
		) {
			expect(result1.evalResult.finalResult.values).toEqual([
				createNumber(11),
				createNumber(12),
				createNumber(13),
			]);
			expect(result2.evalResult.finalResult.values).toEqual(
				result1.evalResult.finalResult.values
			);
		}
	});
});
