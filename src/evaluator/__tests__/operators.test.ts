import { describe, expect, test } from 'bun:test';
import type {
	BinaryExpression,
	Expression,
	PipelineExpression,
	VariableExpression,
} from '../../ast';
import { createTraitRegistry } from '../../typer/trait-system';
import {
	evaluateBinary,
	evaluatePipeline,
	type OperatorContext,
} from '../operators';
import {
	boolValue,
	createBool,
	createConstructor,
	createFunction,
	createNumber,
	type Value,
} from '../evaluator-utils';

const location = {
	start: { line: 1, column: 1 },
	end: { line: 1, column: 1 },
};
const variable = (name: string): VariableExpression => ({
	kind: 'variable',
	name,
	location,
});
const binary = (
	operator: BinaryExpression['operator'],
	left: Expression = variable('left'),
	right: Expression = variable('right')
): BinaryExpression => ({ kind: 'binary', operator, left, right, location });

const context = (
	values: Record<string, Value>,
	trace: string[] = []
): OperatorContext => ({
	traitRegistry: createTraitRegistry(),
	evaluateExpression: expression => {
		if (expression.kind !== 'variable')
			throw new Error('unexpected expression');
		trace.push(`evaluate:${expression.name}`);
		const value = values[expression.name];
		if (!value) throw new Error(`missing ${expression.name}`);
		return value;
	},
	isTraitFunction: () => false,
	resolveTraitFunctionWithArgs: () => {
		throw new Error('unexpected trait resolution');
	},
	evaluateEquality: () => createBool(false),
	applyTraitFunctionWithValues: () => {
		throw new Error('unexpected trait application');
	},
	lookupOperator: () => undefined,
});

describe('operator evaluation', () => {
	test('eager binary operands evaluate left-to-right exactly once', () => {
		const trace: string[] = [];
		const result = evaluateBinary(
			binary('+'),
			context({ left: createNumber(2), right: createNumber(3) }, trace)
		);

		expect(result).toEqual(createNumber(5));
		expect(trace).toEqual(['evaluate:left', 'evaluate:right']);
	});

	test('sequence discards the left result and evaluates the right once', () => {
		const trace: string[] = [];
		const result = evaluateBinary(
			binary(';'),
			context({ left: createNumber(1), right: createNumber(2) }, trace)
		);

		expect(result).toEqual(createNumber(2));
		expect(trace).toEqual(['evaluate:left', 'evaluate:right']);
	});

	test('logical operators skip only the short-circuited right operand', () => {
		const andTrace: string[] = [];
		const andResult = evaluateBinary(
			binary('&&'),
			context({ left: createBool(false), right: createBool(true) }, andTrace)
		);
		expect(boolValue(andResult)).toBe(false);
		expect(andTrace).toEqual(['evaluate:left']);

		const orTrace: string[] = [];
		const orResult = evaluateBinary(
			binary('||'),
			context({ left: createBool(true), right: createBool(false) }, orTrace)
		);
		expect(boolValue(orResult)).toBe(true);
		expect(orTrace).toEqual(['evaluate:left']);
	});

	test('safe thrush evaluates both operands but does not invoke the function for None', () => {
		const trace: string[] = [];
		const none = createConstructor('None', []);
		const right = createFunction(value => {
			trace.push('invoke:right');
			return value;
		});
		const result = evaluateBinary(
			binary('|?'),
			context({ left: none, right }, trace)
		);

		expect(result).toEqual(none);
		expect(trace).toEqual(['evaluate:left', 'evaluate:right']);
	});

	test('/ and % retain Option results including zero divisors', () => {
		const values = { left: createNumber(8), right: createNumber(2) };
		expect(evaluateBinary(binary('/'), context(values))).toEqual(
			createConstructor('Some', [createNumber(4)])
		);
		expect(evaluateBinary(binary('%'), context(values))).toEqual(
			createConstructor('Some', [createNumber(0)])
		);

		const zero = { left: createNumber(8), right: createNumber(0) };
		expect(evaluateBinary(binary('/'), context(zero))).toEqual(
			createConstructor('None', [])
		);
		expect(evaluateBinary(binary('%'), context(zero))).toEqual(
			createConstructor('None', [])
		);
	});

	test('pipeline direction controls expression evaluation and invocation order', () => {
		const run = (operator: '|>' | '<|') => {
			const trace: string[] = [];
			const values = {
				left: createFunction(value => {
					trace.push('invoke:left');
					return value;
				}),
				right: createFunction(value => {
					trace.push('invoke:right');
					return value;
				}),
			};
			const expression: PipelineExpression = {
				kind: 'pipeline',
				steps: [variable('left'), variable('right')],
				operators: [operator],
				location,
			};
			const composed = evaluatePipeline(expression, context(values, trace));
			if (composed.tag !== 'function') throw new Error('expected function');
			composed.fn(createNumber(1));
			return trace;
		};

		expect(run('|>')).toEqual([
			'evaluate:left',
			'evaluate:right',
			'invoke:left',
			'invoke:right',
		]);
		expect(run('<|')).toEqual([
			'evaluate:right',
			'evaluate:left',
			'invoke:right',
			'invoke:left',
		]);
	});
});
