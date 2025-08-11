import { test, expect } from 'bun:test';
import { assertConstructorValue, runCode } from '../utils';
import { createNumber } from '../../src/evaluator/evaluator';

test('should handle simple Option construction', () => {
	const result = runCode(`Some 42`);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(42)]);
});

test('should handle None construction', () => {
	const result = runCode(`None`);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('None');
	expect(result.evalResult.finalResult.args).toEqual([]);
});

test('should handle Option in conditional expressions', () => {
	const result = runCode(`if True then Some 42 else None`);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(42)]);
});

test('should handle Option function return types', () => {
	const result = runCode(`
      makeOption = fn x => if x > 0 then Some x else None;
      makeOption 5
    `);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(5)]);
});
