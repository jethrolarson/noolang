import { test, expect, describe } from 'bun:test';
import { validateStructuralConstraint } from '../unify';
import { createTypeState } from '../type-operations';
import {
	floatType,
	stringType,
	recordType,
	typeVariable,
	type RecordStructure,
} from '../../ast';

// A nested structure is what a chained accessor composes to — `p has {@address
// {@city b}}`. Validating one has to descend into @address and check the inner
// record too. unify used to throw "Nested record structures not yet implemented"
// here, which was survivable only because nested constraints never reached it.
//
// They still do not reach it by any route I could find through the surface
// language, so these exercise the validator directly. Testing it through an
// expression would prove nothing: the assertion would pass whether or not the
// recursion works.

const nested = (
	outerField: string,
	innerField: string,
	innerType = typeVariable('b')
): RecordStructure => ({
	fields: {
		[outerField]: {
			kind: 'nested',
			structure: { fields: { [innerField]: innerType } },
		},
	},
});

describe('Nested structural constraint validation', () => {
	test('accepts a record whose nested field satisfies the inner structure', () => {
		const actual = recordType({
			address: recordType({ city: stringType(), street: stringType() }),
		});
		const state = validateStructuralConstraint(
			actual,
			nested('address', 'city'),
			createTypeState()
		);
		// The inner field's type flows into the constraint's leaf variable.
		expect(state.substitution.get('b')).toEqual(stringType());
	});

	test('rejects a record whose nested field lacks the inner field', () => {
		const actual = recordType({
			address: recordType({ street: stringType() }),
		});
		expect(() =>
			validateStructuralConstraint(
				actual,
				nested('address', 'city'),
				createTypeState()
			)
		).toThrow(/Record has no field @city/);
	});

	test('rejects a record whose nested field is not a record', () => {
		const actual = recordType({ address: floatType() });
		expect(() =>
			validateStructuralConstraint(
				actual,
				nested('address', 'city'),
				createTypeState()
			)
		).toThrow(/Cannot access @city on Float/);
	});

	test('rejects a record missing the outer field entirely', () => {
		const actual = recordType({ name: stringType() });
		expect(() =>
			validateStructuralConstraint(
				actual,
				nested('address', 'city'),
				createTypeState()
			)
		).toThrow(/Record has no field @address/);
	});

	test('recurses to arbitrary depth', () => {
		const actual = recordType({
			a: recordType({ b: recordType({ c: floatType() }) }),
		});
		const structure: RecordStructure = {
			fields: {
				a: {
					kind: 'nested',
					structure: {
						fields: {
							b: {
								kind: 'nested',
								structure: { fields: { c: typeVariable('leaf') } },
							},
						},
					},
				},
			},
		};
		const state = validateStructuralConstraint(
			actual,
			structure,
			createTypeState()
		);
		expect(state.substitution.get('leaf')).toEqual(floatType());
	});
});
