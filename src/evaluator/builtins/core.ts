import { createError } from '../../errors';
import {
	type Environment,
	type Value,
	boolValue,
	createBool,
	createFalse,
	createFunction,
	createNativeFunction,
	createNumber,
	createString,
	createTrue,
	isAnyFunction,
	isBool,
	isFunction,
	isNativeFunction,
	isNumber,
	isString,
	isTraitFunctionValue,
	isUnit,
} from '../evaluator-utils';
import type { BuiltinDependencies } from './types';

export const registerCoreBuiltins = (
	environment: Environment,
	dependencies: BuiltinDependencies
): void => {
	// Arithmetic operations
	environment.set(
		'+',
		createNativeFunction('+', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createNumber(a.value + b.value);
			if (isString(a) && isString(b)) return createString(a.value + b.value);
			throw new Error(`Cannot add ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`);
		})
	);
	environment.set(
		'-',
		createNativeFunction('-', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createNumber(a.value - b.value);
			throw new Error(
				`Cannot subtract ${b?.tag || 'unit'} from ${a?.tag || 'unit'}`
			);
		})
	);
	environment.set(
		'*',
		createNativeFunction('*', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createNumber(a.value * b.value);
			throw new Error(
				`Cannot multiply ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`
			);
		})
	);
	environment.set(
		'%',
		createNativeFunction('%', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				if (b.value === 0) {
					const error = createError(
						'RuntimeError',
						'Division by zero',
						undefined,
						`${a.value} % ${b.value}`,
						'Check that the divisor is not zero before dividing'
					);
					throw error;
				}
				return createNumber(a.value % b.value);
			}
			throw new Error(
				`Cannot modulus ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`
			);
		})
	);
	environment.set(
		'/',
		createNativeFunction('/', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				if (b.value === 0) {
					const error = createError(
						'RuntimeError',
						'Division by zero',
						undefined,
						`${a.value} / ${b.value}`,
						'Check that the divisor is not zero before dividing'
					);
					throw error;
				}
				return createNumber(a.value / b.value);
			}
			throw new Error(
				`Cannot divide ${a?.tag || 'unit'} by ${b?.tag || 'unit'}`
			);
		})
	);

	// Comparison operations
	environment.set(
		'==',
		createNativeFunction('==', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				return createBool(a.value === b.value);
			} else if (isString(a) && isString(b)) {
				return createBool(a.value === b.value);
			} else if (isBool(a) && isBool(b)) {
				return createBool(boolValue(a) === boolValue(b));
			} else if (isUnit(a) && isUnit(b)) {
				return createTrue();
			} else if (isUnit(a) || isUnit(b)) {
				return createFalse();
			}
			return createFalse();
		})
	);
	environment.set(
		'!=',
		createNativeFunction('!=', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) {
				return createBool(a.value !== b.value);
			} else if (isString(a) && isString(b)) {
				return createBool(a.value !== b.value);
			} else if (isBool(a) && isBool(b)) {
				return createBool(boolValue(a) !== boolValue(b));
			} else if (isUnit(a) && isUnit(b)) {
				return createFalse();
			} else if (isUnit(a) || isUnit(b)) {
				return createTrue();
			}
			return createTrue();
		})
	);
	environment.set(
		'<',
		createNativeFunction('<', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createBool(a.value < b.value);
			if (isString(a) && isString(b)) return createBool(a.value < b.value);
			throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
		})
	);
	environment.set(
		'>',
		createNativeFunction('>', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createBool(a.value > b.value);
			if (isString(a) && isString(b)) return createBool(a.value > b.value);
			throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
		})
	);
	environment.set(
		'<=',
		createNativeFunction('<=', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createBool(a.value <= b.value);
			if (isString(a) && isString(b)) return createBool(a.value <= b.value);
			throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
		})
	);
	environment.set(
		'>=',
		createNativeFunction('>=', (a: Value) => (b: Value) => {
			if (isNumber(a) && isNumber(b)) return createBool(a.value >= b.value);
			if (isString(a) && isString(b)) return createBool(a.value >= b.value);
			throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
		})
	);

	// Pipeline operator
	environment.set(
		'|',
		createNativeFunction('|', (value: Value) => (func: Value) => {
			if (isFunction(func) || isNativeFunction(func)) {
				return func.fn(value);
			} else if (isTraitFunctionValue(func)) {
				return dependencies.applyTraitFunctionWithValues(func, [value]);
			}
			throw new Error(
				`Cannot apply non-function in thrush: ${func?.tag || 'unit'}`
			);
		})
	);

	// Left-to-right composition
	environment.set(
		'|>',
		createNativeFunction('|>', (f: Value) => (g: Value) => {
			if (isAnyFunction(f) && isAnyFunction(g)) {
				return createFunction((x: Value) => {
					// Apply f to x
					let intermediate: Value;
					if (isFunction(f) || isNativeFunction(f)) {
						intermediate = f.fn(x);
					} else if (isTraitFunctionValue(f)) {
						intermediate = dependencies.applyTraitFunctionWithValues(f, [x]);
					} else {
						throw new Error(
							`Invalid function type in composition: ${(f as Value).tag}`
						);
					}

					// Apply g to the result
					if (isFunction(g) || isNativeFunction(g)) {
						return g.fn(intermediate);
					} else if (isTraitFunctionValue(g)) {
						return dependencies.applyTraitFunctionWithValues(g, [intermediate]);
					} else {
						throw new Error(
							`Invalid function type in composition: ${(g as Value).tag}`
						);
					}
				});
			}
			throw new Error(
				`Cannot compose non-functions: ${f?.tag || 'unit'} and ${
					g?.tag || 'unit'
				}`
			);
		})
	);

	// Right-to-left composition
	environment.set(
		'<|',
		createNativeFunction('<|', (f: Value) => (g: Value) => {
			if (isAnyFunction(f) && isAnyFunction(g)) {
				return createFunction((x: Value) => {
					// Apply g to x first
					let intermediate: Value;
					if (isFunction(g) || isNativeFunction(g)) {
						intermediate = g.fn(x);
					} else if (isTraitFunctionValue(g)) {
						intermediate = dependencies.applyTraitFunctionWithValues(g, [x]);
					} else {
						throw new Error(
							`Invalid function type in composition: ${(g as Value).tag}`
						);
					}

					// Apply f to the result
					if (isFunction(f) || isNativeFunction(f)) {
						return f.fn(intermediate);
					} else if (isTraitFunctionValue(f)) {
						return dependencies.applyTraitFunctionWithValues(f, [intermediate]);
					} else {
						throw new Error(
							`Invalid function type in composition: ${(f as Value).tag}`
						);
					}
				});
			}

			throw new Error(
				`Cannot compose non-functions: ${f?.tag || 'unit'} and ${
					g?.tag || 'unit'
				}`
			);
		})
	);

	// Semicolon operator
	environment.set(
		';',
		createNativeFunction(';', (_left: Value) => (right: Value) => right)
	);

	// Dollar operator (low precedence function application)
	environment.set(
		'$',
		createNativeFunction('$', (func: Value) => (arg: Value) => {
			// Handle trait function application
			if (func.tag === 'trait-function') {
				// Call trait function directly with values (no need to convert back to AST)
				return dependencies.applyTraitFunctionWithValues(func, [arg]);
			}

			if (isFunction(func)) {
				// Handle tagged function - single argument application
				if (typeof func.fn === 'function') {
					return func.fn(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof func.fn}`
					);
				}
			} else if (isNativeFunction(func)) {
				// Handle native function - single argument application
				const result: any = func.fn;
				if (typeof result === 'function') {
					return result(arg);
				} else if (isFunction(result)) {
					return result.fn(arg);
				} else if (isNativeFunction(result)) {
					return result.fn(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof result}`
					);
				}
			} else {
				throw new Error(
					`Cannot apply non-function: ${typeof func} (${func?.tag || 'unknown'})`
				);
			}
		})
	);
};
