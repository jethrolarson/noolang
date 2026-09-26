import {
	type Environment,
	type Value,
	createBool,
	createConstructor,
	createFalse,
	createList,
	createNativeFunction,
	createNumber,
	createRecord,
	createString,
	createTrue,
	isConstructor,
	isNativeFunction,
	isNumber,
	isRecord,
	isString,
	isTuple,
	isUnit,
	valueToString,
} from '../evaluator-utils';
import type { BuiltinDependencies } from './types';

export const registerMathBuiltins = (environment: Environment): void => {
	// Math utilities
	environment.set(
		'abs',
		createNativeFunction('abs', (n: Value) => {
			if (isNumber(n)) return createNumber(Math.abs(n.value));
			throw new Error('abs requires a number');
		})
	);
	environment.set(
		'max',
		createNativeFunction('max', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b))
				return createNumber(Math.max(a.value, b.value));
			throw new Error('max requires two numbers');
		})
	);
	environment.set(
		'min',
		createNativeFunction('min', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b))
				return createNumber(Math.min(a.value, b.value));
			throw new Error('min requires two numbers');
		})
	);
};

export const registerStringRecordBuiltins = (
	environment: Environment,
	dependencies: BuiltinDependencies
): void => {
	// String utilities
	environment.set(
		'concat',
		createNativeFunction('concat', (a: Value) => (b: Value) => {
			if (isString(a) && isString(b)) return createString(a.value + b.value);
			throw new Error('concat requires two strings');
		})
	);
	environment.set(
		'toString',
		createNativeFunction('toString', (value: Value) =>
			createString(valueToString(value))
		)
	);

	environment.set(
		'split',
		createNativeFunction('split', (delimiter: Value) => (str: Value) => {
			if (!isString(delimiter) || !isString(str)) {
				throw new Error('split requires two strings');
			}
			const parts =
				delimiter.value === ''
					? str.value.split('')
					: str.value.split(delimiter.value);
			return createList(parts.map(createString));
		})
	);

	environment.set(
		'chars',
		createNativeFunction('chars', (str: Value) => {
			if (!isString(str)) throw new Error('chars requires a string');
			return createList(Array.from(str.value).map(createString));
		})
	);

	environment.set(
		'char_code',
		createNativeFunction('char_code', (str: Value) => {
			if (!isString(str)) throw new Error('char_code requires a string');
			if (str.value.length === 0) return createConstructor('None', []);
			return createConstructor('Some', [
				createNumber(str.value.codePointAt(0) as number),
			]);
		})
	);

	environment.set(
		'from_char_code',
		createNativeFunction('from_char_code', (code: Value) => {
			if (!isNumber(code)) throw new Error('from_char_code requires a number');
			try {
				return createConstructor('Some', [
					createString(String.fromCodePoint(code.value)),
				]);
			} catch {
				return createConstructor('None', []);
			}
		})
	);

	environment.set(
		'trim',
		createNativeFunction('trim', (str: Value) => {
			if (!isString(str)) throw new Error('trim requires a string');
			return createString(str.value.trim());
		})
	);

	environment.set(
		'toUpper',
		createNativeFunction('toUpper', (str: Value) => {
			if (!isString(str)) throw new Error('toUpper requires a string');
			return createString(str.value.toUpperCase());
		})
	);

	environment.set(
		'toLower',
		createNativeFunction('toLower', (str: Value) => {
			if (!isString(str)) throw new Error('toLower requires a string');
			return createString(str.value.toLowerCase());
		})
	);

	environment.set(
		'indexOf',
		createNativeFunction('indexOf', (needle: Value) => (haystack: Value) => {
			if (!isString(needle) || !isString(haystack)) {
				throw new Error('indexOf requires two strings');
			}
			const idx = haystack.value.indexOf(needle.value);
			return idx === -1
				? createConstructor('None', [])
				: createConstructor('Some', [createNumber(idx)]);
		})
	);

	environment.set(
		'startsWith',
		createNativeFunction('startsWith', (prefix: Value) => (str: Value) => {
			if (!isString(prefix) || !isString(str)) {
				throw new Error('startsWith requires two strings');
			}
			return createBool(str.value.startsWith(prefix.value));
		})
	);

	environment.set(
		'endsWith',
		createNativeFunction('endsWith', (suffix: Value) => (str: Value) => {
			if (!isString(suffix) || !isString(str)) {
				throw new Error('endsWith requires two strings');
			}
			return createBool(str.value.endsWith(suffix.value));
		})
	);

	environment.set(
		'replace',
		createNativeFunction(
			'replace',
			(search: Value) => (replacement: Value) => (str: Value) => {
				if (!isString(search) || !isString(replacement) || !isString(str)) {
					throw new Error('replace requires three strings');
				}
				return createString(
					str.value.split(search.value).join(replacement.value)
				);
			}
		)
	);

	environment.set(
		'substring',
		createNativeFunction(
			'substring',
			(start: Value) => (end: Value) => (str: Value) => {
				if (!isNumber(start) || !isNumber(end) || !isString(str)) {
					throw new Error('substring requires two numbers and a string');
				}
				return createString(str.value.slice(start.value, end.value));
			}
		)
	);

	environment.set(
		'argv',
		createList(dependencies.programArgs.map(createString))
	);

	// Unknown utilities (pure)
	environment.set(
		'forget',
		createNativeFunction('forget', (value: Value) => value)
	);

	// Record utilities
	environment.set(
		'hasKey',
		createNativeFunction('hasKey', (record: Value) => (key: Value) => {
			if (isRecord(record) && isString(key)) {
				return createBool(key.value in record.fields);
			}
			if (isUnit(record) && isString(key)) {
				// Unit values (empty braces) can be treated as empty records
				return createBool(false);
			}
			throw new Error('hasKey requires a record and a string key');
		})
	);
	environment.set(
		'hasValue',
		createNativeFunction('hasValue', (record: Value) => (value: Value) => {
			if (isRecord(record)) {
				return createBool(Object.values(record.fields).includes(value));
			}
			throw new Error('hasValue requires a record');
		})
	);
	environment.set(
		'set',
		createNativeFunction(
			'set',
			(accessor: Value) => (newValue: Value) => (record: Value) => {
				if (isNativeFunction(accessor) && isRecord(record)) {
					// For now, just handle simple field accessors
					const field = accessor.name?.replace('@', '');
					if (field) {
						return createRecord({ ...record.fields, [field]: newValue });
					}
				}
				throw new Error('set requires an accessor, record, and new value');
			}
		)
	);

	// Tuple operations
	environment.set(
		'tupleLength',
		createNativeFunction('tupleLength', (tuple: Value) => {
			if (isUnit(tuple)) {
				return createNumber(0);
			}
			if (isTuple(tuple)) {
				return createNumber(tuple.values.length);
			}
			throw new Error('tupleLength requires a tuple');
		})
	);
	environment.set(
		'tupleIsEmpty',
		createNativeFunction('tupleIsEmpty', (tuple: Value) => {
			if (isUnit(tuple)) {
				return createBool(true);
			}
			if (isTuple(tuple)) {
				return createBool(tuple.values.length === 0);
			}
			throw new Error('tupleIsEmpty requires a tuple');
		})
	);

	// Built-in ADT constructors are now self-hosted in stdlib.noo

	// Option utility functions
	environment.set(
		'isSome',
		createNativeFunction('isSome', (option: Value) => {
			if (isConstructor(option) && option.name === 'Some') {
				return createTrue();
			} else if (isConstructor(option) && option.name === 'None') {
				return createFalse();
			}
			throw new Error('isSome requires an Option value');
		})
	);

	environment.set(
		'isNone',
		createNativeFunction('isNone', (option: Value) => {
			if (isConstructor(option) && option.name === 'None') {
				return createTrue();
			} else if (isConstructor(option) && option.name === 'Some') {
				return createFalse();
			}
			throw new Error('isNone requires an Option value');
		})
	);

	environment.set(
		'unwrap',
		createNativeFunction('unwrap', (option: Value) => {
			if (
				isConstructor(option) &&
				option.name === 'Some' &&
				option.args.length === 1
			) {
				return option.args[0];
			} else if (isConstructor(option) && option.name === 'None') {
				throw new Error('Cannot unwrap None value');
			}
			throw new Error('unwrap requires a Some value');
		})
	);

	// Result utility functions
	environment.set(
		'isOk',
		createNativeFunction('isOk', (result: Value) => {
			if (isConstructor(result) && result.name === 'Ok') {
				return createTrue();
			} else if (isConstructor(result) && result.name === 'Err') {
				return createFalse();
			}
			throw new Error('isOk requires a Result value');
		})
	);

	environment.set(
		'isErr',
		createNativeFunction('isErr', (result: Value) => {
			if (isConstructor(result) && result.name === 'Err') {
				return createTrue();
			} else if (isConstructor(result) && result.name === 'Ok') {
				return createFalse();
			}
			throw new Error('isErr requires a Result value');
		})
	);
};
