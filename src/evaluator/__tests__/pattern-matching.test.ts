import { describe, expect, test } from 'bun:test';
import type { Pattern } from '../../ast';
import { matchPattern } from '../pattern-matching';
import {
	createConstructor,
	createNumber,
	createRecord,
	createString,
	createTuple,
} from '../evaluator-utils';

const location = {
	start: { line: 1, column: 1 },
	end: { line: 1, column: 1 },
};

type WithoutLocation<T> = T extends unknown ? Omit<T, 'location'> : never;

const pattern = (value: WithoutLocation<Pattern>): Pattern =>
	({ ...value, location }) as Pattern;

describe('matchPattern', () => {
	test('matches wildcard, variables, and literals', () => {
		expect(
			matchPattern(pattern({ kind: 'wildcard' }), createNumber(1))
		).toEqual({
			matched: true,
			bindings: new Map(),
		});
		expect(
			matchPattern(
				pattern({ kind: 'variable', name: 'value' }),
				createNumber(1)
			)
		).toEqual({
			matched: true,
			bindings: new Map([['value', createNumber(1)]]),
		});
		expect(
			matchPattern(
				pattern({ kind: 'literal', value: 'yes' }),
				createString('no')
			)
		).toEqual({ matched: false, bindings: new Map() });
	});

	test('matches nested constructor, tuple, and record patterns', () => {
		const nested = pattern({
			kind: 'record',
			fields: [
				{
					fieldName: 'item',
					location,
					pattern: pattern({
						kind: 'constructor',
						name: 'Some',
						args: [
							pattern({
								kind: 'tuple',
								elements: [pattern({ kind: 'variable', name: 'value' })],
							}),
						],
					}),
				},
			],
		});
		const value = createRecord({
			item: createConstructor('Some', [createTuple([createNumber(42)])]),
		});

		expect(matchPattern(nested, value)).toEqual({
			matched: true,
			bindings: new Map([['value', createNumber(42)]]),
		});
	});

	test('rejects shape, constructor-name, arity, and missing-field mismatches', () => {
		expect(
			matchPattern(
				pattern({ kind: 'constructor', name: 'Some', args: [] }),
				createNumber(1)
			).matched
		).toBe(false);
		expect(
			matchPattern(
				pattern({ kind: 'constructor', name: 'Some', args: [] }),
				createConstructor('None', [])
			).matched
		).toBe(false);
		expect(
			matchPattern(
				pattern({ kind: 'constructor', name: 'Some', args: [] }),
				createConstructor('Some', [createNumber(1)])
			).matched
		).toBe(false);
		expect(
			matchPattern(
				pattern({
					kind: 'record',
					fields: [
						{
							fieldName: 'missing',
							location,
							pattern: pattern({ kind: 'wildcard' }),
						},
					],
				}),
				createRecord({})
			).matched
		).toBe(false);
	});

	test('later recursive bindings retain the existing overwrite order', () => {
		const duplicate = pattern({
			kind: 'tuple',
			elements: [
				pattern({ kind: 'variable', name: 'same' }),
				pattern({ kind: 'variable', name: 'same' }),
			],
		});
		expect(
			matchPattern(
				duplicate,
				createTuple([createNumber(1), createNumber(2)])
			).bindings.get('same')
		).toEqual(createNumber(2));
	});
});
