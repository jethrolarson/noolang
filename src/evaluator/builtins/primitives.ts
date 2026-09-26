import {
	type Environment,
	type Value,
	boolValue,
	createBool,
	createConstructor,
	createFalse,
	createNativeFunction,
	createNumber,
	createString,
	isBool,
	isFunction,
	isList,
	isNativeFunction,
	isNumber,
	isString,
	isTraitFunctionValue,
} from '../evaluator-utils';
import type { BuiltinDependencies } from './types';
import { applyValueFunction } from './helpers';

export const registerPrimitiveBuiltins = (
	environment: Environment,
	dependencies: BuiltinDependencies
): void => {
	// Primitive support functions for trait implementations
	environment.set(
		'primitive_float_eq',
		createNativeFunction('primitive_float_eq', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				return createBool(a.value === b.value);
			}
			return createFalse();
		})
	);

	environment.set(
		'primitive_string_eq',
		createNativeFunction('primitive_string_eq', (a: Value) => (b: Value) => {
			if (isString(a) && isString(b)) {
				return createBool(a.value === b.value);
			}
			return createFalse();
		})
	);

	environment.set(
		'floatToString',
		createNativeFunction('floatToString', (n: Value) => {
			if (isNumber(n)) {
				return createString(n.value.toString());
			}
			throw new Error('floatToString requires a number');
		})
	);

	// Primitive Add trait implementations
	environment.set(
		'primitive_float_add',
		createNativeFunction('primitive_float_add', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				return createNumber(a.value + b.value);
			}
			throw new Error('primitive_float_add requires two numbers');
		})
	);

	environment.set(
		'primitive_float_multiply',
		createNativeFunction(
			'primitive_float_multiply',
			(a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) {
					return createNumber(a.value * b.value);
				}
				throw new Error('primitive_float_multiply requires two numbers');
			}
		)
	);

	environment.set(
		'primitive_float_subtract',
		createNativeFunction(
			'primitive_float_subtract',
			(a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) {
					return createNumber(a.value - b.value);
				}
				throw new Error('primitive_float_subtract requires two numbers');
			}
		)
	);

	environment.set(
		'primitive_float_equals',
		createNativeFunction('primitive_float_equals', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				return createBool(a.value === b.value);
			}
			throw new Error('primitive_float_equals requires two numbers');
		})
	);

	environment.set(
		'primitive_string_equals',
		createNativeFunction(
			'primitive_string_equals',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value === b.value);
				}
				throw new Error('primitive_string_equals requires two strings');
			}
		)
	);

	environment.set(
		'primitive_string_less_than',
		createNativeFunction(
			'primitive_string_less_than',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value < b.value);
				}
				throw new Error('primitive_string_less_than requires two strings');
			}
		)
	);

	environment.set(
		'primitive_string_greater_than',
		createNativeFunction(
			'primitive_string_greater_than',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value > b.value);
				}
				throw new Error('primitive_string_greater_than requires two strings');
			}
		)
	);

	environment.set(
		'primitive_string_less_than_or_equal',
		createNativeFunction(
			'primitive_string_less_than_or_equal',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value <= b.value);
				}
				throw new Error(
					'primitive_string_less_than_or_equal requires two strings'
				);
			}
		)
	);

	environment.set(
		'primitive_string_greater_than_or_equal',
		createNativeFunction(
			'primitive_string_greater_than_or_equal',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value >= b.value);
				}
				throw new Error(
					'primitive_string_greater_than_or_equal requires two strings'
				);
			}
		)
	);

	environment.set(
		'primitive_float_less_than',
		createNativeFunction(
			'primitive_float_less_than',
			(a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) {
					return createBool(a.value < b.value);
				}
				throw new Error('primitive_float_less_than requires two numbers');
			}
		)
	);

	environment.set(
		'primitive_list_all2',
		createNativeFunction(
			'primitive_list_all2',
			(pred: Value) => (list1: Value) => (list2: Value) => {
				if (isList(list1) && isList(list2)) {
					if (list1.values.length !== list2.values.length)
						return createBool(false);
					for (let i = 0; i < list1.values.length; i++) {
						let result: Value;
						if (isFunction(pred) || isNativeFunction(pred)) {
							const partial = applyValueFunction(pred, list1.values[i]);
							result = applyValueFunction(partial, list2.values[i]);
						} else if (isTraitFunctionValue(pred)) {
							result = dependencies.resolveTraitFunctionWithArgs(
								pred.name,
								[list1.values[i], list2.values[i]],
								pred.traitRegistry
							);
						} else {
							throw new Error(
								'primitive_list_all2: predicate must be a function'
							);
						}
						if (!isBool(result) || !boolValue(result)) return createBool(false);
					}
					return createBool(true);
				}
				throw new Error(
					'primitive_list_all2 requires a function and two lists'
				);
			}
		)
	);

	environment.set(
		'primitive_float_divide',
		createNativeFunction('primitive_float_divide', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				if (b.value === 0) {
					return createConstructor('None', []);
				}
				return createConstructor('Some', [createNumber(a.value / b.value)]);
			}
			throw new Error('primitive_float_divide requires two numbers');
		})
	);

	environment.set(
		'primitive_string_concat',
		createNativeFunction(
			'primitive_string_concat',
			(a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createString(a.value + b.value);
				}
				throw new Error('primitive_string_concat requires two strings');
			}
		)
	);

	// Type checking functions for schema validation (pure)
	environment.set(
		'isString',
		createNativeFunction('isString', (value: Value) => {
			return isString(value)
				? createConstructor('Ok', [value])
				: createConstructor('Err', [createString('Expected string')]);
		})
	);
	environment.set(
		'isNumber',
		createNativeFunction('isNumber', (value: Value) => {
			return isNumber(value)
				? createConstructor('Ok', [value])
				: createConstructor('Err', [createString('Expected number')]);
		})
	);
	environment.set(
		'isBool',
		createNativeFunction('isBool', (value: Value) => {
			return isBool(value)
				? createConstructor('Ok', [value])
				: createConstructor('Err', [createString('Expected boolean')]);
		})
	);
	environment.set(
		'isList',
		createNativeFunction('isList', (value: Value) => {
			return isList(value)
				? createConstructor('Ok', [value])
				: createConstructor('Err', [createString('Expected list')]);
		})
	);
};
