import { expect, test } from 'bun:test';
import {
	compareStructuralValues,
	createConstructor,
	createNumber,
	createRecord,
	createTuple,
	type ConstructorValue,
} from '../src/evaluator/evaluator-utils';

const neverCompare = () => {
	throw new Error('components must not be compared after a shape mismatch');
};
const declared = (_value: ConstructorValue) => true;

test('defensive structural equality rejects mismatched product and constructor shapes', () => {
	expect(
		compareStructuralValues(
			createTuple([]),
			createTuple([createNumber(1)]),
			neverCompare,
			declared
		)
	).toBe(false);
	expect(
		compareStructuralValues(
			createRecord({ a: createNumber(1) }),
			createRecord({ b: createNumber(1) }),
			neverCompare,
			declared
		)
	).toBe(false);
	expect(
		compareStructuralValues(
			createConstructor('A', []),
			createConstructor('B', []),
			neverCompare,
			declared
		)
	).toBe(false);
	expect(
		compareStructuralValues(
			createConstructor('A', []),
			createConstructor('A', [createNumber(1)]),
			neverCompare,
			declared
		)
	).toBe(false);
});
