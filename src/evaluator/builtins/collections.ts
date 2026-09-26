import {
	type Environment,
	type Value,
	boolValue,
	createBool,
	createConstructor,
	createList,
	createNativeFunction,
	createNumber,
	createRecord,
	createUnit,
	isBool,
	isFunction,
	isList,
	isNativeFunction,
	isNumber,
	isTraitFunctionValue,
} from '../evaluator-utils';
import type { BuiltinDependencies } from './types';
import { applyValueFunction, createHOFError } from './helpers';

export const registerCollectionBuiltins = (
	environment: Environment,
	dependencies: BuiltinDependencies
): void => {
	// List operations - minimal built-ins for self-hosted functions
	environment.set(
		'list_get',
		createNativeFunction('list_get', (index: Value) => (list: Value) => {
			if (isNumber(index) && isList(list)) {
				const idx = index.value;
				if (idx >= 0 && idx < list.values.length) {
					return createConstructor('Some', [list.values[idx]]);
				} else {
					return createConstructor('None', []);
				}
			}
			throw new Error('list_get: invalid index or not a list');
		})
	);

	// Index accessor for lists only
	environment.set(
		'at',
		createNativeFunction('at', (index: Value) => (list: Value) => {
			if (!isNumber(index)) {
				throw new Error('at: index must be a number');
			}
			if (!isList(list)) {
				throw new Error('at: container must be a list');
			}
			const idx = index.value;
			if (idx < 0 || idx >= list.values.length)
				return createConstructor('None', []);
			return createConstructor('Some', [list.values[idx]]);
		})
	);

	// List operations
	environment.set(
		'tail',
		createNativeFunction('tail', (list: Value) => {
			// Total on lists: tail [] = [] — matches head's no-crash safety
			// story without breaking the guarded `match (head l) ... tail l` idiom
			if (isList(list)) return createList(list.values.slice(1));
			throw new Error('Cannot get tail of non-list');
		})
	);
	environment.set(
		'cons',
		createNativeFunction('cons', (head: Value) => (tail: Value) => {
			if (isList(tail)) return createList([head, ...tail.values]);
			throw new Error('Second argument to cons must be a list');
		})
	);

	// List utility functions
	environment.set(
		'list_map',
		createNativeFunction('list_map', (func: Value) => (list: Value) => {
			if (isList(list)) {
				if (isFunction(func) || isNativeFunction(func)) {
					return createList(
						list.values.map((item: Value) => applyValueFunction(func, item))
					);
				} else if (isTraitFunctionValue(func)) {
					// For trait functions, we need to resolve them for each item
					// Use the trait registry to resolve the function for each item's type
					return createList(
						list.values.map((item: Value) => {
							// Resolve the trait function for this specific type
							const resolved = dependencies.resolveTraitFunctionWithArgs(
								func.name,
								[item],
								func.traitRegistry
							);

							return resolved;
						})
					);
				}
			}
			throw new Error(createHOFError('list_map', ['a function', 'a list']));
		})
	);
	environment.set(
		'list_filter',
		createNativeFunction('list_filter', (pred: Value) => (list: Value) => {
			if ((isFunction(pred) || isNativeFunction(pred)) && isList(list)) {
				return createList(
					list.values.filter((item: Value) => {
						const result = applyValueFunction(pred, item);
						if (!isBool(result)) {
							throw new Error(
								`list_filter: predicate function must return a boolean, got ${result.tag}`
							);
						}
						return boolValue(result);
					})
				);
			}
			throw new Error(
				createHOFError('list_filter', ['a predicate function', 'a list'])
			);
		})
	);
	environment.set(
		'reduce',
		createNativeFunction(
			'reduce',
			(func: Value) => (initial: Value) => (list: Value) => {
				if ((isFunction(func) || isNativeFunction(func)) && isList(list)) {
					return list.values.reduce((acc: Value, item: Value) => {
						const partial = applyValueFunction(func, acc);
						if (isFunction(partial) || isNativeFunction(partial)) {
							return applyValueFunction(partial, item);
						}
						throw new Error(
							'reduce function must return a function after first argument'
						);
					}, initial);
				} else if (isTraitFunctionValue(func) && isList(list)) {
					// Handle bare trait functions (e.g. `add`, `multiply`) as reducers.
					// Resolve the trait implementation for each (acc, item) pair directly.
					return list.values.reduce((acc: Value, item: Value) => {
						const allArgs = func.partialArgs
							? [...func.partialArgs, acc, item]
							: [acc, item];
						return dependencies.resolveTraitFunctionWithArgs(
							func.name,
							allArgs,
							func.traitRegistry
						);
					}, initial);
				}
				throw new Error(
					createHOFError('reduce', ['a function', 'initial value', 'a list'])
				);
			}
		)
	);
	environment.set(
		'length',
		createNativeFunction('length', (list: Value) => {
			if (isList(list)) return createNumber(list.values.length);
			throw new Error('length requires a list');
		})
	);
	environment.set(
		'isEmpty',
		createNativeFunction('isEmpty', (list: Value) => {
			if (isList(list)) return createBool(list.values.length === 0);
			throw new Error('isEmpty requires a list');
		})
	);
	environment.set(
		'append',
		createNativeFunction('append', (list1: Value) => (list2: Value) => {
			if (isList(list1) && isList(list2))
				return createList([...list1.values, ...list2.values]);
			throw new Error('append requires two lists');
		})
	);
	environment.set(
		'list_any',
		createNativeFunction('list_any', (pred: Value) => (list: Value) => {
			if ((isFunction(pred) || isNativeFunction(pred)) && isList(list)) {
				return createBool(
					list.values.some((item: Value) => {
						const result = applyValueFunction(pred, item);
						if (!isBool(result)) {
							throw new Error(
								`list_any: predicate function must return a boolean, got ${result.tag}`
							);
						}
						return boolValue(result);
					})
				);
			}
			throw new Error(
				createHOFError('list_any', ['a predicate function', 'a list'])
			);
		})
	);

	environment.set(
		'list_find',
		createNativeFunction('list_find', (pred: Value) => (list: Value) => {
			if ((isFunction(pred) || isNativeFunction(pred)) && isList(list)) {
				const foundItem = list.values.find((item: Value) => {
					const result = applyValueFunction(pred, item);
					if (!isBool(result)) {
						throw new Error(
							`list_find: predicate function must return a boolean, got ${result.tag}`
						);
					}
					return boolValue(result);
				});

				return foundItem !== undefined
					? createConstructor('Some', [foundItem])
					: createConstructor('None', []);
			}
			throw new Error(
				createHOFError('list_find', ['a predicate function', 'a list'])
			);
		})
	);
	environment.set(
		'find',
		createNativeFunction('find', (pred: Value) => (list: Value) => {
			if ((isFunction(pred) || isNativeFunction(pred)) && isList(list)) {
				const found = list.values.find((item: Value) => {
					const result = applyValueFunction(pred, item);
					if (!isBool(result)) {
						throw new Error(
							`find: predicate function must return a boolean, got ${result.tag}`
						);
					}
					return boolValue(result);
				});
				return found ? found : createUnit();
			}
			throw new Error(
				createHOFError('find', ['a predicate function', 'a list'])
			);
		})
	);
	environment.set(
		'zip',
		createNativeFunction('zip', (list1: Value) => (list2: Value) => {
			if (isList(list1) && isList(list2)) {
				const minLength = Math.min(list1.values.length, list2.values.length);
				const zipped = [];
				for (let i = 0; i < minLength; i++) {
					zipped.push(
						createRecord({
							'@1': list1.values[i],
							'@2': list2.values[i],
						})
					);
				}
				return createList(zipped);
			}
			throw new Error('zip requires two lists');
		})
	);
};
