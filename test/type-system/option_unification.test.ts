import { test, expect } from 'bun:test';
import { assertConstructorValue, runCode } from '../utils';
import { createNumber } from '../../src/evaluator/evaluator';

test('should handle simple Option construction', () => {
	const code = `Some 42`;
	const result = runCode(code);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(42)]);
});

test('should handle None construction', () => {
	const code = `None`;
	const result = runCode(code);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('None');
	expect(result.evalResult.finalResult.args).toEqual([]);
});

test('should handle Option in conditional expressions', () => {
	// FIXME: Currently fails with "Cannot unify Option a with Option a"
	const code = `
      result = if True then Some 42 else None;
      result
    `;
	const result = runCode(code);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(42)]);
});

test('should handle Option function return types', () => {
	const code = `
      makeOption = fn x => if x > 0 then Some x else None;
      makeOption 5
    `;
	const result = runCode(code);
	assertConstructorValue(result.evalResult.finalResult);
	expect(result.evalResult.finalResult.name).toBe('Some');
	expect(result.evalResult.finalResult.args).toEqual([createNumber(5)]);
});
