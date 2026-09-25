import { expect, expectTypeOf, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTraitRegistry } from '../../typer/trait-system';
import {
	Evaluator,
	boolValue,
	createFunction,
	createNativeFunction,
	createNumber,
	isAnyFunction,
	isBool,
	isConstructor,
	isFunction,
	isList,
	isNativeFunction,
	isNumber,
	isRecord,
	isString,
	isTraitFunctionValue,
	isTuple,
	isUnit,
	type Environment,
	type ExecutionStep,
	type ProgramResult,
	type Value,
} from '../evaluator';
import { parseProgram } from './helpers';

test('[characterization] evaluator.ts retains its facade and compatibility exports', () => {
	const evaluator = new Evaluator({
		fs,
		path,
		traitRegistry: createTraitRegistry(),
		skipStdlib: true,
		programArgs: ['arg'],
	});
	const result = evaluator.evaluateProgram(parseProgram('1'));

	expectTypeOf(evaluator.environment).toMatchTypeOf<Environment>();
	expectTypeOf(evaluator.evaluateExpression).toBeFunction();
	expectTypeOf(evaluator.getEnvironment()).toEqualTypeOf<Map<string, Value>>();
	expectTypeOf(result).toEqualTypeOf<ProgramResult>();
	expectTypeOf(result.executionTrace[0]).toEqualTypeOf<ExecutionStep>();

	const number = createNumber(1);
	const fn = createFunction(value => value);
	const native = createNativeFunction('identity', value => value);
	expect(isNumber(number)).toBe(true);
	expect(isFunction(fn)).toBe(true);
	expect(isNativeFunction(native)).toBe(true);
	expect(isAnyFunction(fn)).toBe(true);

	// Compile-time guards for the remaining compatibility guards/helpers.
	void [
		boolValue,
		isTraitFunctionValue,
		isString,
		isBool,
		isList,
		isRecord,
		isTuple,
		isUnit,
		isConstructor,
	];
});
