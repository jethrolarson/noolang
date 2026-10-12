import { expect, test } from 'bun:test';
import {
	evaluateRecordDestructuring,
	evaluateTupleDestructuring,
} from '../destructuring';
import { createNumber, createRecord, createTuple } from '../evaluator-utils';
import { parseProgram } from './helpers';

test('tuple destructuring evaluates once, binds in order, and returns the RHS', () => {
	const expr = parseProgram('{left, right} = ignored').statements[0];
	if (expr.kind !== 'tuple-destructuring') {
		throw new Error('expected tuple destructuring expression');
	}
	const value = createTuple([createNumber(1), createNumber(2)]);
	const bindings: string[] = [];
	let evaluations = 0;

	const result = evaluateTupleDestructuring(expr, {
		evaluateExpression: expression => {
			expect(expression).toBe(expr.value);
			evaluations++;
			return value;
		},
		bind: name => bindings.push(name),
	});

	expect(result).toBe(value);
	expect(evaluations).toBe(1);
	expect(bindings).toEqual(['left', 'right']);
});

test('record destructuring keeps earlier bindings when a later field is missing', () => {
	const expr = parseProgram('{@first, @missing} = ignored').statements[0];
	if (expr.kind !== 'record-destructuring') {
		throw new Error('expected record destructuring expression');
	}
	const bindings = new Map();

	expect(() =>
		evaluateRecordDestructuring(expr, {
			evaluateExpression: () => createRecord({ first: createNumber(1) }),
			bind: (name, value) => bindings.set(name, value),
		})
	).toThrow("Field 'missing' not found in record");
	expect(bindings).toEqual(new Map([['first', createNumber(1)]]));
});
