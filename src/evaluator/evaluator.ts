import * as defaultFs from 'node:fs';
import * as defaultPath from 'node:path';
import type {
	Expression,
	Program,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	PipelineExpression,
	BinaryExpression,
	IfExpression,
	DefinitionExpression,
	TupleDestructuringExpression,
	RecordDestructuringExpression,
	TupleDestructuringPattern,
	RecordDestructuringPattern,
	ImportExpression,
	RecordExpression,
	AccessorExpression,
	TypeDefinitionExpression,
	UserDefinedTypeExpression,
	MatchExpression,
	Pattern,
	WhereExpression,
	MutableDefinitionExpression,
	MutationExpression,
} from '../ast';
import type { TraitRegistry } from '../typer/trait-system';
import {
	Value,
	Cell,
	isFunction,
	isNativeFunction,
	isTraitFunctionValue,
	createNativeFunction,
	createFunction,
	createNumber,
	createString,
	createBool,
	boolValue,
	createTrue,
	createFalse,
	createUnit,
	createTuple,
	createConstructor,
	createList,
	createRecord,
	isNumber,
	isString,
	isBool,
	isUnit,
	isAnyFunction,
	isList,
	isRecord,
	isConstructor,
	isTuple,
	isCell,
	createCell,
	valueToString,
} from './evaluator-utils';

// Re-export commonly used utilities for backward compatibility
export {
	type Value,
	isFunction,
	isNativeFunction,
	isTraitFunctionValue,
	isNumber,
	isString,
	isBool,
	isList,
	isRecord,
	isTuple,
	isUnit,
	isConstructor,
	isAnyFunction,
	boolValue,
	createFunction,
	createNativeFunction,
	createNumber,
};

import { createError } from '../errors';
import { formatValue } from '../format';
import { Lexer } from '../lexer/lexer';
import { parse } from '../parser/parser';

export type ExecutionStep = {
	expression: string;
	result: Value;
	type?: string;
	location?: { line: number; column: number };
};

export type ProgramResult = {
	finalResult: Value;
	executionTrace: ExecutionStep[];
	environment: Map<string, Value>;
};

export type Environment = Map<string, Value | Cell>;

// Helper to flatten semicolon-separated binary expressions into individual statements
const flattenStatements = (expr: Expression): Expression[] => {
	if (expr.kind === 'binary' && expr.operator === ';') {
		return [...flattenStatements(expr.left), ...flattenStatements(expr.right)];
	}
	return [expr];
};

// Helper function to apply any kind of function (regular, native, or trait functions)
function applyValueFunction(func: Value, arg: Value): Value {
	if (isFunction(func) || isNativeFunction(func)) {
		return func.fn(arg);
	}
	throw new Error(
		`Cannot apply argument to non-function: ${func?.tag || 'unknown'}`
	);
}

// Helper function for consistent HOF error messages
function createHOFError(functionName: string, requiredArgs: string[]): string {
	return `${functionName} requires ${requiredArgs.join(', ')}`;
}

export class Evaluator {
	public environment: Environment;
	private environmentStack: Environment[]; // Stack for efficient scoping
	private currentFileDir?: string; // Track the directory of the current file being evaluated
	private fs: typeof defaultFs;
	private path: typeof defaultPath;
	private traitRegistry: TraitRegistry;

	constructor(opts: {
		fs?: typeof defaultFs;
		path?: typeof defaultPath;
		traitRegistry: TraitRegistry;
		skipStdlib?: boolean;
	}) {
		this.fs = opts.fs ?? defaultFs;
		this.path = opts.path ?? defaultPath;
		this.traitRegistry = opts.traitRegistry;
		this.environment = new Map();
		this.environmentStack = [];
		this.initializeBuiltins();

		if (!opts?.skipStdlib) {
			this.loadStdlib();
		}
	}

	private initializeBuiltins(): void {
		// Arithmetic operations
		this.environment.set(
			'+',
			createNativeFunction('+', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createNumber(a.value + b.value);
				if (isString(a) && isString(b)) return createString(a.value + b.value);
				throw new Error(
					`Cannot add ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`
				);
			})
		);
		this.environment.set(
			'-',
			createNativeFunction('-', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createNumber(a.value - b.value);
				throw new Error(
					`Cannot subtract ${b?.tag || 'unit'} from ${a?.tag || 'unit'}`
				);
			})
		);
		this.environment.set(
			'*',
			createNativeFunction('*', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createNumber(a.value * b.value);
				throw new Error(
					`Cannot multiply ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`
				);
			})
		);
		this.environment.set(
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
		this.environment.set(
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
		this.environment.set(
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
		this.environment.set(
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
		this.environment.set(
			'<',
			createNativeFunction('<', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createBool(a.value < b.value);
				throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
			})
		);
		this.environment.set(
			'>',
			createNativeFunction('>', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createBool(a.value > b.value);
				throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
			})
		);
		this.environment.set(
			'<=',
			createNativeFunction('<=', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createBool(a.value <= b.value);
				throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
			})
		);
		this.environment.set(
			'>=',
			createNativeFunction('>=', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createBool(a.value >= b.value);
				throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
			})
		);

		// Pipeline operator
		this.environment.set(
			'|',
			createNativeFunction('|', (value: Value) => (func: Value) => {
				if (isFunction(func) || isNativeFunction(func)) {
					return func.fn(value);
				} else if (isTraitFunctionValue(func)) {
					return this.applyTraitFunctionWithValues(func, [value]);
				}
				throw new Error(
					`Cannot apply non-function in thrush: ${func?.tag || 'unit'}`
				);
			})
		);

		// Left-to-right composition
		this.environment.set(
			'|>',
			createNativeFunction('|>', (f: Value) => (g: Value) => {
				if (isAnyFunction(f) && isAnyFunction(g)) {
					return createFunction((x: Value) => {
						// Apply f to x
						let intermediate: Value;
						if (isFunction(f) || isNativeFunction(f)) {
							intermediate = f.fn(x);
						} else if (isTraitFunctionValue(f)) {
							intermediate = this.applyTraitFunctionWithValues(f, [x]);
						} else {
							throw new Error(
								`Invalid function type in composition: ${(f as Value).tag}`
							);
						}

						// Apply g to the result
						if (isFunction(g) || isNativeFunction(g)) {
							return g.fn(intermediate);
						} else if (isTraitFunctionValue(g)) {
							return this.applyTraitFunctionWithValues(g, [intermediate]);
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
		this.environment.set(
			'<|',
			createNativeFunction('<|', (f: Value) => (g: Value) => {
				if (isAnyFunction(f) && isAnyFunction(g)) {
					return createFunction((x: Value) => {
						// Apply g to x first
						let intermediate: Value;
						if (isFunction(g) || isNativeFunction(g)) {
							intermediate = g.fn(x);
						} else if (isTraitFunctionValue(g)) {
							intermediate = this.applyTraitFunctionWithValues(g, [x]);
						} else {
							throw new Error(
								`Invalid function type in composition: ${(g as Value).tag}`
							);
						}

						// Apply f to the result
						if (isFunction(f) || isNativeFunction(f)) {
							return f.fn(intermediate);
						} else if (isTraitFunctionValue(f)) {
							return this.applyTraitFunctionWithValues(f, [intermediate]);
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
		this.environment.set(
			';',
			createNativeFunction(';', (_left: Value) => (right: Value) => right)
		);

		// Dollar operator (low precedence function application)
		this.environment.set(
			'$',
			createNativeFunction('$', (func: Value) => (arg: Value) => {
				// Handle trait function application
				if (func.tag === 'trait-function') {
					// Call trait function directly with values (no need to convert back to AST)
					return this.applyTraitFunctionWithValues(func, [arg]);
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

		// List operations - minimal built-ins for self-hosted functions
		this.environment.set(
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

		// Generic index accessor for lists and tuples
		this.environment.set(
			'at',
			createNativeFunction('at', (index: Value) => (container: Value) => {
				if (!isNumber(index)) {
					throw new Error('at: index must be a number');
				}
				const idx = index.value;
				if (idx < 0) return createConstructor('None', []);

				if (isList(container)) {
					return idx < container.values.length
						? createConstructor('Some', [container.values[idx]])
						: createConstructor('None', []);
				}
				if (isTuple(container)) {
					return idx < container.values.length
						? createConstructor('Some', [container.values[idx]])
						: createConstructor('None', []);
				}
				if (isUnit(container)) {
					return createConstructor('None', []);
				}
				throw new Error('at: container must be a list or tuple');
			})
		);

		// List operations
		this.environment.set(
			'tail',
			createNativeFunction('tail', (list: Value) => {
				if (isList(list) && list.values.length > 0)
					return createList(list.values.slice(1));
				throw new Error('Cannot get tail of empty list or non-list');
			})
		);
		this.environment.set(
			'cons',
			createNativeFunction('cons', (head: Value) => (tail: Value) => {
				if (isList(tail)) return createList([head, ...tail.values]);
				throw new Error('Second argument to cons must be a list');
			})
		);

		// List utility functions
		this.environment.set(
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
								const resolved = this.resolveTraitFunctionWithArgs(
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
		this.environment.set(
			'filter',
			createNativeFunction('filter', (pred: Value) => (list: Value) => {
				if ((isFunction(pred) || isNativeFunction(pred)) && isList(list)) {
					return createList(
						list.values.filter((item: Value) => {
							const result = applyValueFunction(pred, item);
							if (!isBool(result)) {
								throw new Error(
									`filter: predicate function must return a boolean, got ${result.tag}`
								);
							}
							return boolValue(result);
						})
					);
				}
				throw new Error(
					createHOFError('filter', ['a predicate function', 'a list'])
				);
			})
		);
		this.environment.set(
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
					}
					throw new Error(
						createHOFError('reduce', ['a function', 'initial value', 'a list'])
					);
				}
			)
		);
		this.environment.set(
			'length',
			createNativeFunction('length', (list: Value) => {
				if (isList(list)) return createNumber(list.values.length);
				throw new Error('length requires a list');
			})
		);
		this.environment.set(
			'isEmpty',
			createNativeFunction('isEmpty', (list: Value) => {
				if (isList(list)) return createBool(list.values.length === 0);
				throw new Error('isEmpty requires a list');
			})
		);
		this.environment.set(
			'append',
			createNativeFunction('append', (list1: Value) => (list2: Value) => {
				if (isList(list1) && isList(list2))
					return createList([...list1.values, ...list2.values]);
				throw new Error('append requires two lists');
			})
		);

		// Math utilities
		this.environment.set(
			'abs',
			createNativeFunction('abs', (n: Value) => {
				if (isNumber(n)) return createNumber(Math.abs(n.value));
				throw new Error('abs requires a number');
			})
		);
		this.environment.set(
			'max',
			createNativeFunction('max', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b))
					return createNumber(Math.max(a.value, b.value));
				throw new Error('max requires two numbers');
			})
		);
		this.environment.set(
			'min',
			createNativeFunction('min', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b))
					return createNumber(Math.min(a.value, b.value));
				throw new Error('min requires two numbers');
			})
		);

		// Effectful functions
		this.environment.set(
			'print',
			createNativeFunction('print', (value: Value) => {
				console.log(formatValue(value));
				return value; // Return the value that was printed
			})
		);

		// String utilities
		this.environment.set(
			'concat',
			createNativeFunction('concat', (a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) return createString(a.value + b.value);
				throw new Error('concat requires two strings');
			})
		);
		this.environment.set(
			'toString',
			createNativeFunction('toString', (value: Value) =>
				createString(valueToString(value))
			)
		);

		// Record utilities
		this.environment.set(
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
		this.environment.set(
			'hasValue',
			createNativeFunction('hasValue', (record: Value) => (value: Value) => {
				if (isRecord(record)) {
					return createBool(Object.values(record.fields).includes(value));
				}
				throw new Error('hasValue requires a record');
			})
		);
		this.environment.set(
			'set',
			createNativeFunction(
				'set',
				(accessor: Value) => (record: Value) => (newValue: Value) => {
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
		this.environment.set(
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
		this.environment.set(
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
		this.environment.set(
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

		this.environment.set(
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

		this.environment.set(
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
		this.environment.set(
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

		this.environment.set(
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

		// Missing builtin implementations
		this.environment.set(
			'println',
			createNativeFunction('println', (value: Value) => {
				console.log(valueToString(value));
				return value;
			})
		);

		this.environment.set(
			'readFile',
			createNativeFunction('readFile', (path: Value) => {
				if (!isString(path)) {
					throw new Error('readFile requires a string path');
				}
				try {
					const content = this.fs.readFileSync(path.value, 'utf-8');
					return createString(content);
				} catch (error) {
					throw new Error(`Failed to read file: ${error}`);
				}
			})
		);

		this.environment.set(
			'writeFile',
			createNativeFunction('writeFile', (path: Value) => (content: Value) => {
				if (!isString(path)) {
					throw new Error('writeFile requires a string path');
				}
				if (!isString(content)) {
					throw new Error('writeFile requires string content');
				}
				try {
					this.fs.writeFileSync(path.value, content.value);
					return createUnit();
				} catch (error) {
					throw new Error(`Failed to write file: ${error}`);
				}
			})
		);

		this.environment.set(
			'log',
			createNativeFunction('log', (message: Value) => {
				if (!isString(message)) {
					throw new Error('log requires a string message');
				}
				console.log(`[LOG] ${message.value}`);
				return createUnit();
			})
		);

		this.environment.set(
			'random',
			createNativeFunction('random', () => {
				return createNumber(
					Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
				);
			})
		);

		this.environment.set(
			'randomRange',
			createNativeFunction('randomRange', (min: Value) => (max: Value) => {
				if (!isNumber(min) || !isNumber(max)) {
					throw new Error('randomRange requires number arguments');
				}
				const minVal = Math.min(min.value, max.value);
				const maxVal = Math.max(min.value, max.value);
				return createNumber(
					Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal
				);
			})
		);

		this.environment.set(
			'mutSet',
			createNativeFunction('mutSet', (ref: Value) => (value: Value) => {
				if (!isCell(ref)) {
					throw new Error('mutSet requires a mutable reference');
				}
				ref.value = value;
				return createUnit();
			})
		);

		this.environment.set(
			'mutGet',
			createNativeFunction('mutGet', (ref: Value) => {
				if (!isCell(ref)) {
					throw new Error('mutGet requires a mutable reference');
				}
				return ref.value;
			})
		);

		// Primitive support functions for trait implementations
		this.environment.set(
			'primitive_float_eq',
			createNativeFunction('primitive_float_eq', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) {
					return createBool(a.value === b.value);
				}
				return createFalse();
			})
		);

		this.environment.set(
			'primitive_string_eq',
			createNativeFunction('primitive_string_eq', (a: Value) => (b: Value) => {
				if (isString(a) && isString(b)) {
					return createBool(a.value === b.value);
				}
				return createFalse();
			})
		);

		this.environment.set(
			'floatToString',
			createNativeFunction('floatToString', (n: Value) => {
				if (isNumber(n)) {
					return createString(n.value.toString());
				}
				throw new Error('floatToString requires a number');
			})
		);

		// Primitive Add trait implementations
		this.environment.set(
			'primitive_float_add',
			createNativeFunction('primitive_float_add', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) {
					return createNumber(a.value + b.value);
				}
				throw new Error('primitive_float_add requires two numbers');
			})
		);

		this.environment.set(
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
	}

	private loadStdlib(): void {
		// Try multiple possible paths for stdlib.noo
		const possiblePaths = [
			this.path.join(__dirname, '..', 'stdlib.noo'),
			this.path.join(process.cwd(), 'stdlib.noo'),
			this.path.join(process.cwd(), 'src', '..', 'stdlib.noo'),
		];

		let stdlibPath: string | null = null;
		for (const path of possiblePaths) {
			if (this.fs.existsSync(path)) {
				stdlibPath = path;
				break;
			}
		}

		if (!stdlibPath) {
			const msg = `[Noolang ERROR] Could not find stdlib.noo in any of these paths:\n  ${possiblePaths.join(
				'\n  '
			)}`;
			console.error(msg);
			throw new Error(msg);
		}
		const stdlibContent = this.fs.readFileSync(stdlibPath, 'utf-8');
		const lexer = new Lexer(stdlibContent);
		const tokens = lexer.tokenize();
		const stdlibProgram = parse(tokens);
		const allStatements: Expression[] = [];
		for (const statement of stdlibProgram.statements) {
			allStatements.push(...flattenStatements(statement));
		}
		for (const statement of allStatements) {
			this.evaluateExpression(statement);
		}
	}

	evaluateProgram(program: Program, filePath?: string): ProgramResult {
		if (filePath) {
			this.currentFileDir = this.path.dirname(this.path.resolve(filePath));
		}

		const executionTrace: ExecutionStep[] = [];

		if (program.statements.length === 0) {
			return {
				finalResult: createList([]),
				executionTrace,
				environment: new Map(
					Array.from(this.environment.entries()).map(([k, v]) => [
						k,
						isCell(v) ? v.value : v,
					])
				),
			};
		}

		let finalResult: Value = createList([]);

		for (const statement of program.statements) {
			const result = this.evaluateExpression(statement);

			// Add to execution trace
			executionTrace.push({
				expression: this.expressionToString(statement),
				result: result,
				location: {
					line: statement.location.start.line,
					column: statement.location.start.column,
				},
			});

			finalResult = result;
		}

		return {
			finalResult,
			executionTrace,
			environment: new Map(
				Array.from(this.environment.entries()).map(([k, v]) => [
					k,
					isCell(v) ? v.value : v,
				])
			),
		};
	}

	private evaluateDefinition(def: DefinitionExpression): Value {
		// Check if this definition might be recursive by looking for the name in the value
		const isRecursive = this.containsVariable(def.value, def.name);

		if (isRecursive) {
			// For recursive definitions, we need a placeholder that gets updated
			const cell = createCell(createUnit());
			this.environment.set(def.name, cell);
			const value = this.evaluateExpression(def.value);
			cell.value = value;
			return value;
		} else {
			// For non-recursive definitions, store the value directly
			const value = this.evaluateExpression(def.value);
			this.environment.set(def.name, value);
			return value;
		}
	}

	private evaluateTupleDestructuring(
		expr: TupleDestructuringExpression
	): Value {
		// Evaluate the right-hand side (tuple value)
		const value = this.evaluateExpression(expr.value);

		// Extract the tuple elements
		if (value.tag !== 'tuple') {
			throw new Error('Expected tuple value for tuple destructuring');
		}

		// Check that the number of pattern elements matches tuple elements
		if (expr.pattern.elements.length !== value.values.length) {
			throw new Error(
				`Tuple destructuring length mismatch: pattern has ${expr.pattern.elements.length} elements but value has ${value.values.length}`
			);
		}

		// Bind each pattern element to its corresponding value
		for (let i = 0; i < expr.pattern.elements.length; i++) {
			const element = expr.pattern.elements[i];
			const elementValue = value.values[i];

			if (element.kind === 'variable') {
				this.environment.set(element.name, elementValue);
			} else if (element.kind === 'nested-tuple') {
				// Handle nested tuple destructuring
				if (elementValue.tag !== 'tuple') {
					throw new Error(`Expected tuple value for nested tuple destructuring at position ${i}, got ${elementValue.tag}`);
				}
				
				this.extractTupleElements(element.pattern, elementValue);
			} else if (element.kind === 'nested-record') {
				// Handle nested record destructuring
				if (elementValue.tag !== 'record') {
					throw new Error(`Expected record value for nested record destructuring at position ${i}, got ${elementValue.tag}`);
				}
				
				this.extractRecordFields(element.pattern, elementValue);
			} else {
				throw new Error(`Unknown destructuring element kind: ${(element as any).kind}`);
			}
		}

		return value;
	}

	private extractTupleElements(pattern: TupleDestructuringPattern, tupleValue: any): void {
		// Check that the number of pattern elements matches tuple elements
		if (pattern.elements.length !== tupleValue.values.length) {
			throw new Error(
				`Nested tuple destructuring length mismatch: pattern has ${pattern.elements.length} elements but value has ${tupleValue.values.length}`
			);
		}

		// Bind each pattern element to its corresponding value
		for (let i = 0; i < pattern.elements.length; i++) {
			const element = pattern.elements[i];
			const elementValue = tupleValue.values[i];

			if (element.kind === 'variable') {
				this.environment.set(element.name, elementValue);
			} else if (element.kind === 'nested-tuple') {
				if (elementValue.tag !== 'tuple') {
					throw new Error(`Expected tuple value for nested tuple destructuring at position ${i}, got ${elementValue.tag}`);
				}
				this.extractTupleElements(element.pattern, elementValue);
			} else if (element.kind === 'nested-record') {
				if (elementValue.tag !== 'record') {
					throw new Error(`Expected record value for nested record destructuring at position ${i}, got ${elementValue.tag}`);
				}
				this.extractRecordFields(element.pattern, elementValue);
			} else {
				throw new Error(`Unknown destructuring element kind: ${(element as any).kind}`);
			}
		}
	}

	private extractRecordFields(pattern: RecordDestructuringPattern, recordValue: any): void {
		// Bind each pattern field to its corresponding value
		for (const field of pattern.fields) {
			if (field.kind === 'shorthand') {
				// @name -> name
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				this.environment.set(field.fieldName, recordValue.fields[field.fieldName]);
			} else if (field.kind === 'rename') {
				// @name userName -> userName
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				this.environment.set(field.localName, recordValue.fields[field.fieldName]);
			} else if (field.kind === 'nested-tuple') {
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				const fieldValue = recordValue.fields[field.fieldName];
				if (fieldValue.tag !== 'tuple') {
					throw new Error(`Expected tuple value for nested tuple destructuring in field '${field.fieldName}', got ${fieldValue.tag}`);
				}
				this.extractTupleElements(field.pattern, fieldValue);
			} else if (field.kind === 'nested-record') {
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				const fieldValue = recordValue.fields[field.fieldName];
				if (fieldValue.tag !== 'record') {
					throw new Error(`Expected record value for nested record destructuring in field '${field.fieldName}', got ${fieldValue.tag}`);
				}
				this.extractRecordFields(field.pattern, fieldValue);
			} else {
				throw new Error(`Unknown record destructuring field kind: ${(field as any).kind}`);
			}
		}
	}

	private evaluateRecordDestructuring(
		expr: RecordDestructuringExpression
	): Value {
		// Evaluate the right-hand side (record value)
		const value = this.evaluateExpression(expr.value);

		// Extract the record fields
		if (value.tag !== 'record') {
			throw new Error('Expected record value for record destructuring');
		}

		// Use the helper method to extract fields
		this.extractRecordFields(expr.pattern, value);

		return value;
	}

	private evaluateMutableDefinition(expr: MutableDefinitionExpression): Value {
		// Evaluate the right-hand side
		const value = this.evaluateExpression(expr.value);
		// Store a cell in the environment
		this.environment.set(expr.name, createCell(value));
		return value;
	}

	private evaluateMutation(expr: MutationExpression): Value {
		// Look up the variable in the environment
		const cell = this.environment.get(expr.target);
		if (!isCell(cell)) {
			throw new Error(`Cannot mutate non-mutable variable: ${expr.target}`);
		}
		// Evaluate the new value
		const value = this.evaluateExpression(expr.value);
		// Update the cell's value
		cell.value = value;
		return value;
	}

	evaluateExpression(expr: Expression): Value {
		switch (expr.kind) {
			case 'literal':
				return this.evaluateLiteral(expr);

			case 'variable':
				return this.evaluateVariable(expr);

			case 'function':
				return this.evaluateFunction(expr);

			case 'application':
				return this.evaluateApplication(expr);

			case 'pipeline':
				return this.evaluatePipeline(expr);

			case 'binary':
				return this.evaluateBinary(expr);

			case 'if':
				return this.evaluateIf(expr);

			case 'definition':
				return this.evaluateDefinition(expr);

			case 'tuple-destructuring':
				return this.evaluateTupleDestructuring(expr);

			case 'record-destructuring':
				return this.evaluateRecordDestructuring(expr);

			case 'mutable-definition':
				return this.evaluateMutableDefinition(expr);

			case 'mutation':
				return this.evaluateMutation(expr);

			case 'import':
				return this.evaluateImport(expr);

			case 'record':
				return this.evaluateRecord(expr);

			case 'accessor':
				return this.evaluateAccessor(expr);

			case 'tuple': {
				// Evaluate all elements and return a tagged tuple value
				const elements = expr.elements.map(e => {
					let val = this.evaluateExpression(e);
					if (isCell(val)) val = val.value;
					return val;
				});
				return createTuple(elements);
			}
			case 'unit': {
				// Return unit value
				return createUnit();
			}
			case 'list': {
				// Evaluate all elements and return a tagged list value
				const elements = expr.elements.map(e => {
					let val = this.evaluateExpression(e);
					if (isCell(val)) val = val.value;
					return val;
				});
				return createList(elements);
			}
			case 'where': {
				return this.evaluateWhere(expr);
			}
			case 'typed':
				// Type annotations are erased at runtime; just evaluate the inner expression
				return this.evaluateExpression(expr.expression);
			case 'constrained':
				// Constraint annotations are erased at runtime; just evaluate the inner expression
				return this.evaluateExpression(expr.expression);
			case 'type-definition':
				return this.evaluateTypeDefinition(expr as TypeDefinitionExpression);
			case 'user-defined-type':
				return this.evaluateUserDefinedType(expr as UserDefinedTypeExpression);
			case 'match':
				return this.evaluateMatch(expr as MatchExpression);
			case 'constraint-definition':
				return createUnit();
			case 'implement-definition':
				return createUnit();
			default:
				throw new Error(
					`Unknown expression kind: ${(expr as Expression).kind}`
				);
		}
	}

	private evaluateLiteral(expr: LiteralExpression): Value {
		if (Array.isArray(expr.value)) {
			// If it's a list, evaluate each element
			return createList(
				expr.value.map(element => {
					if (element && typeof element === 'object' && 'kind' in element) {
						// It's an AST node, evaluate it
						return this.evaluateExpression(element as Expression);
					} else {
						// It's already a value
						return element;
					}
				})
			);
		}

		// Convert primitive values to tagged values
		if (typeof expr.value === 'number') {
			return createNumber(expr.value);
		} else if (typeof expr.value === 'string') {
			return createString(expr.value);
		} else if (expr.value === null) {
			// Handle unit literals (null in AST represents unit)
			return createUnit();
		}

		// Should not reach here anymore since we removed boolean literals
		throw new Error(`Unsupported literal value: ${expr.value}`);
	}

	private evaluateVariable(expr: VariableExpression): Value {
		const value = this.environment.get(expr.name);
		if (value === undefined) {
			// NEW: Check if this is a trait function before throwing error
			if (this.isTraitFunction(expr.name)) {
				// Return a special trait function value that will be resolved during application
				return {
					tag: 'trait-function',
					name: expr.name,
					traitRegistry: this.traitRegistry,
				};
			}

			const error = createError(
				'RuntimeError',
				`Undefined variable: ${expr.name}`,
				{
					line: expr.location.start.line,
					column: expr.location.start.column,
					start: expr.location.start.line,
					end: expr.location.end.line,
				},
				expr.name,
				`Define the variable before using it: ${expr.name} = value`
			);
			throw error;
		}
		// If it's a cell, return its value
		if (isCell(value)) {
			return value.value;
		}
		return value;
	}

	private evaluateFunction(expr: FunctionExpression): Value {
		const self = this;
		// Create a closure that captures the current environment
		const closureEnv = new Map(this.environment);

		function createCurriedFunction(params: string[], body: Expression): Value {
			return createFunction((arg: Value) => {
				// Create a new environment for this function call
				const callEnv = new Map(closureEnv);

				// Set the parameter in the call environment
				const param = params[0];
				callEnv.set(param, arg);

				let result: Value;
				if (params.length === 1) {
					// Use environment stacking for efficient scoping
					result = self.withNewEnvironment(() => {
						self.environment = callEnv;
						return self.evaluateExpression(body);
					});
				} else {
					// Create a function that captures the current parameter
					const remainingParams = params.slice(1);

					const nextFunction = createFunction((nextArg: Value) => {
						const nextCallEnv = new Map(callEnv);
						nextCallEnv.set(remainingParams[0], nextArg);

						if (remainingParams.length === 1) {
							return self.withNewEnvironment(() => {
								self.environment = nextCallEnv;
								return self.evaluateExpression(body);
							});
						} else {
							// Continue currying for remaining parameters
							const remainingFunction = self.withNewEnvironment(() => {
								self.environment = nextCallEnv;
								return self.evaluateFunction({
									...expr,
									params: remainingParams,
								});
							});
							if (isFunction(remainingFunction)) {
								return remainingFunction.fn(nextArg);
							} else {
								throw new Error(
									`Expected function but got: ${typeof remainingFunction}`
								);
							}
						}
					});

					result = nextFunction;
				}

				return result;
			});
		}

		return createCurriedFunction(expr.params, expr.body);
	}

	private evaluateApplication(expr: ApplicationExpression): Value {
		const func = this.evaluateExpression(expr.func);

		// NEW: Handle trait function application
		if (func.tag === 'trait-function') {
			return this.evaluateTraitFunctionApplication(func, expr.args);
		}

		// Only apply the function to the arguments present in the AST
		const args = expr.args;

		if (isFunction(func)) {
			// Handle tagged function application
			let result: any = func.fn;

			for (const argExpr of args) {
				let arg = this.evaluateExpression(argExpr);
				if (isCell(arg)) arg = arg.value;
				if (typeof result === 'function') {
					result = result(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof result}`
					);
				}
			}

			return result;
		} else if (isNativeFunction(func)) {
			// Handle native function application
			let result: any = func.fn;

			for (const argExpr of args) {
				let arg = this.evaluateExpression(argExpr);
				if (isCell(arg)) arg = arg.value;
				if (typeof result === 'function') {
					result = result(arg);
				} else if (isFunction(result)) {
					result = result.fn(arg);
				} else if (isNativeFunction(result)) {
					result = result.fn(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof result} (${result?.tag || 'unknown'})`
					);
				}
			}

			return result;
		} else {
			throw new Error(
				`Cannot apply non-function: ${typeof func} (${func?.tag || 'unknown'})`
			);
		}
	}

	private evaluatePipeline(expr: PipelineExpression): Value {
		// Pipeline should be function composition, not function application
		// For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))
		// For a pipeline like f <| g <| h, we want to compose them as f(g(h(x)))

		if (expr.steps.length === 1) {
			return this.evaluateExpression(expr.steps[0]);
		}

		// Determine composition direction based on operators
		const isLeftToRight = expr.operators.every(op => op === '|>');
		const isRightToLeft = expr.operators.every(op => op === '<|');

		if (!isLeftToRight && !isRightToLeft) {
			throw new Error(
				`Cannot mix pipeline operators |> and <| in the same expression`
			);
		}

		// For right-to-left composition (<|), reverse the steps
		const steps = isRightToLeft ? [...expr.steps].reverse() : expr.steps;

		// Start with the first function
		let composed = this.evaluateExpression(steps[0]);

		// Compose with each subsequent function
		for (let i = 1; i < steps.length; i++) {
			const nextFunc = this.evaluateExpression(steps[i]);

			if (isAnyFunction(composed) && isAnyFunction(nextFunc)) {
				// Capture the current composed function to avoid infinite recursion
				const currentComposed = composed;
				// Compose: nextFunc(composed(x))
				composed = createFunction((x: Value) => {
					// Apply currentComposed to x
					let intermediate: Value;
					if (
						isFunction(currentComposed) ||
						isNativeFunction(currentComposed)
					) {
						intermediate = currentComposed.fn(x);
					} else if (isTraitFunctionValue(currentComposed)) {
						intermediate = this.applyTraitFunctionWithValues(currentComposed, [
							x,
						]);
					} else {
						throw new Error(
							`Invalid function type in pipeline: ${(currentComposed as any).tag}`
						);
					}

					// Apply nextFunc to the result
					if (isFunction(nextFunc) || isNativeFunction(nextFunc)) {
						return nextFunc.fn(intermediate);
					} else if (isTraitFunctionValue(nextFunc)) {
						return this.applyTraitFunctionWithValues(nextFunc, [intermediate]);
					} else {
						throw new Error(
							`Invalid function type in pipeline: ${(nextFunc as any).tag}`
						);
					}
				});
			} else {
				throw new Error(
					`Cannot compose non-functions in pipeline: ${valueToString(
						composed
					)} and ${valueToString(nextFunc)}`
				);
			}
		}

		return composed;
	}

	private evaluateBinary(expr: BinaryExpression): Value {
		if (expr.operator === ';') {
			// Handle semicolon operator (sequence)
			// Evaluate left expression and discard result
			this.evaluateExpression(expr.left);
			// Evaluate and return right expression
			return this.evaluateExpression(expr.right);
		} else if (expr.operator === '|') {
			// Handle thrush operator
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(right)) {
				return right.fn(left);
			} else if (isNativeFunction(right)) {
				return right.fn(left);
			} else {
				throw new Error(
					`Cannot apply non-function in thrush: ${valueToString(right)}`
				);
			}
		} else if (expr.operator === '|?') {
			// The |? operator should be desugared to a bind call by the type checker
			// However, if constraint resolution failed, we might still see |? here
			// Fall back to calling the trait bind function directly
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			// Check that right operand is a function
			if (!isAnyFunction(right)) {
				throw new Error(
					`Cannot apply non-function in safe thrush: ${valueToString(right)}`
				);
			}

			// Try to resolve bind as a trait function
			if (this.isTraitFunction('bind')) {
				try {
					// Use trait function resolution for bind
					const result = this.resolveTraitFunctionWithArgs(
						'bind',
						[left, right],
						this.traitRegistry
					);
					if (result) {
						return result;
					}
				} catch (_e) {
					// Fall through to legacy lookup
				}
			}

			throw new Error(
				'Safe thrush operator (|?) failed: no bind function available'
			);
		} else if (expr.operator === '$') {
			// Handle dollar operator (low precedence function application)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(left) || isNativeFunction(left)) {
				return left.fn(right);
			} else if (isTraitFunctionValue(left)) {
				return this.applyTraitFunctionWithValues(left, [right]);
			} else {
				throw new Error(
					`Cannot apply non-function in dollar operator: ${valueToString(left)}`
				);
			}
		} else if (expr.operator === '|>') {
			// Left-to-right composition: f |> g means g(f(x))
			const left = this.evaluateExpression(expr.left);
			const leftVal = isCell(left) ? left.value : left;
			const right = this.evaluateExpression(expr.right);
			const rightVal = isCell(right) ? right.value : right;

			if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
				throw new Error(
					`Both operands of |> must be functions, got ${leftVal.tag} and ${rightVal.tag}`
				);
			}

			// Left-to-right composition: g(f(x))
			return createFunction((x: Value) => {
				// Apply left function first
				let intermediate: Value;
				if (isFunction(leftVal) || isNativeFunction(leftVal)) {
					intermediate = leftVal.fn(x);
				} else if (isTraitFunctionValue(leftVal)) {
					intermediate = this.applyTraitFunctionWithValues(leftVal, [x]);
				} else {
					throw new Error(
						`Invalid function type in |> composition: ${(leftVal as Value).tag}`
					);
				}

				// Apply right function to the result
				if (isFunction(rightVal) || isNativeFunction(rightVal)) {
					return rightVal.fn(intermediate);
				} else if (isTraitFunctionValue(rightVal)) {
					return this.applyTraitFunctionWithValues(rightVal, [intermediate]);
				} else {
					throw new Error(
						`Invalid function type in |> composition: ${(rightVal as Value).tag}`
					);
				}
			});
		} else if (expr.operator === '<|') {
			// Right-to-left composition: f <| g means f(g(x))
			const left = this.evaluateExpression(expr.left);
			const leftVal = isCell(left) ? left.value : left;
			const right = this.evaluateExpression(expr.right);
			const rightVal = isCell(right) ? right.value : right;

			if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
				throw new Error(
					`Both operands of <| must be functions, got ${leftVal.tag} and ${rightVal.tag}`
				);
			}

			// Right-to-left composition: f(g(x))
			return createFunction((x: Value) => {
				// Apply right function first
				let intermediate: Value;
				if (isFunction(rightVal) || isNativeFunction(rightVal)) {
					intermediate = rightVal.fn(x);
				} else if (isTraitFunctionValue(rightVal)) {
					intermediate = this.applyTraitFunctionWithValues(rightVal, [x]);
				} else {
					throw new Error(
						`Invalid function type in <| composition: ${(rightVal as Value).tag}`
					);
				}

				// Apply left function to the result
				if (isFunction(leftVal) || isNativeFunction(leftVal)) {
					return leftVal.fn(intermediate);
				} else if (isTraitFunctionValue(leftVal)) {
					return this.applyTraitFunctionWithValues(leftVal, [intermediate]);
				} else {
					throw new Error(
						`Invalid function type in <| composition: ${(leftVal as Value).tag}`
					);
				}
			});
		} else {
			// Handle other binary operators (arithmetic, comparison, etc.)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);
			const leftVal = isCell(left) ? left.value : left;
			const rightVal = isCell(right) ? right.value : right;

			// Special handling for arithmetic operators - use primitive operations for basic types
			if (expr.operator === '+') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value + rightVal.value);
				}
				if (isString(leftVal) && isString(rightVal)) {
					return createString(leftVal.value + rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('add')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'add',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot add ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '-') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value - rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('subtract')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'subtract',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot subtract ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '*') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value * rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('multiply')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'multiply',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot multiply ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '/') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					if (rightVal.value === 0) {
						return createConstructor('None', []); // None for division by zero
					}
					return createConstructor('Some', [
						createNumber(leftVal.value / rightVal.value),
					]); // Some(result)
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('divide')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'divide',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot divide ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '%') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					if (rightVal.value === 0) {
						return createConstructor('None', []); // None for modulo by zero
					}
					return createConstructor('Some', [
						createNumber(leftVal.value % rightVal.value),
					]); // Some(result)
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('modulus')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'modulus',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot modulus ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			const operator = this.environment.get(expr.operator);
			const operatorVal = isCell(operator) ? operator.value : operator;
			if (operatorVal && isNativeFunction(operatorVal)) {
				const fn: any = operatorVal.fn(leftVal);
				if (typeof fn === 'function') {
					return fn(rightVal);
				} else if (isFunction(fn)) {
					return fn.fn(rightVal);
				} else if (isNativeFunction(fn)) {
					return fn.fn(rightVal);
				}
				throw new Error(`Operator ${expr.operator} did not return a function`);
			}

			throw new Error(`Unknown operator: ${expr.operator}`);
		}
	}

	private evaluateIf(expr: IfExpression): Value {
		const condition = this.evaluateExpression(expr.condition);

		// Check if condition is truthy - handle tagged boolean values
		let isTruthy = false;
		if (isBool(condition)) {
			isTruthy = boolValue(condition);
		} else if (isNumber(condition)) {
			isTruthy = condition.value !== 0;
		} else if (isString(condition)) {
			isTruthy = condition.value !== '';
		} else if (isUnit(condition)) {
			isTruthy = true;
		} else {
			// For other types (functions, lists, records), consider them truthy
			isTruthy = true;
		}

		if (isTruthy) {
			return this.evaluateExpression(expr.then);
		} else {
			return this.evaluateExpression(expr.else);
		}
	}

	private evaluateImport(expr: ImportExpression): Value {
		try {
			const filePath = expr.path.endsWith('.noo')
				? expr.path
				: `${expr.path}.noo`;

			let fullPath: string;
			if (this.path.isAbsolute(filePath)) {
				fullPath = filePath;
			} else if (this.currentFileDir) {
				fullPath = this.path.resolve(this.currentFileDir, filePath);
			} else {
				fullPath = this.path.resolve(filePath);
			}

			const content = this.fs.readFileSync(fullPath, 'utf8');
			const lexer = new Lexer(content);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			const tempEvaluator = new Evaluator({
				fs: this.fs,
				path: this.path,
				traitRegistry: this.traitRegistry,
			});
			const result = tempEvaluator.evaluateProgram(program, fullPath);
			return result.finalResult;
		} catch (error) {
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
				if (error.stack) {
					errorMessage += '\nStack trace:\n' + error.stack;
				}
			} else if (typeof error === 'object') {
				try {
					errorMessage = JSON.stringify(error, null, 2);
				} catch (_e) {
					errorMessage = String(error);
				}
			} else {
				errorMessage = String(error);
			}
			const cwd = process.cwd();
			const filePath = expr.path.endsWith('.noo')
				? expr.path
				: `${expr.path}.noo`;

			let fullPath: string;
			if (this.path.isAbsolute(filePath)) {
				fullPath = filePath;
			} else if (this.currentFileDir) {
				fullPath = this.path.resolve(this.currentFileDir, filePath);
			} else {
				fullPath = this.path.resolve(filePath);
			}

			const structuredError = createError(
				'ImportError',
				`Failed to import '${
					expr.path
				}': ${errorMessage}\n  Tried to resolve: ${fullPath}\n  Current working directory: ${cwd}\n  Importing file directory: ${
					this.currentFileDir || 'unknown'
				}\n  Suggestion: Use a path relative to the importing file, e.g., 'math_functions' or '../std/math'`,
				{
					line: expr.location.start.line,
					column: expr.location.start.column,
					start: expr.location.start.line,
					end: expr.location.end.line,
				},
				`import "${expr.path}"`,
				'Check that the file exists and can be parsed, and that the path is correct relative to the importing file.'
			);
			throw structuredError;
		}
	}

	private evaluateRecord(expr: RecordExpression): Value {
		const record: { [key: string]: Value } = {};
		for (const field of expr.fields) {
			let val = this.evaluateExpression(field.value);
			if (isCell(val)) val = val.value;
			record[field.name] = val;
		}
		return createRecord(record);
	}

	private evaluateAccessor(expr: AccessorExpression): Value {
		// Return a function that takes a record and returns the field value
		return createNativeFunction(`@${expr.field}${expr.optional ? '?' : ''}`, (record: Value): Value => {
			if (isRecord(record)) {
				const field = expr.field;
				const fieldWithAt = `@${field}`;

				// Try field with @ prefix first (new format), then without (legacy format)
				if (fieldWithAt in record.fields) {
					const val = record.fields[fieldWithAt];
					return expr.optional ? createConstructor('Some', [val]) : val;
				} else if (field in record.fields) {
					const val = record.fields[field];
					return expr.optional ? createConstructor('Some', [val]) : val;
				}
			}
			if (expr.optional) {
				// None constructor when not found
				return createConstructor('None', []);
			}
			throw new Error(`Field '${expr.field}' not found in record`);
		});
	}

	private evaluateWhere(expr: WhereExpression): Value {
		// Use environment stacking for where clause
		return this.withNewEnvironment(() => {
			// Evaluate all definitions in the where clause
			for (const def of expr.definitions) {
				if (def.kind === 'definition') {
					const value = this.evaluateExpression(def.value);
					this.environment.set(def.name, value);
				} else if (def.kind === 'mutable-definition') {
					const value = this.evaluateExpression(def.value);
					this.environment.set(def.name, createCell(value));
				} else if (def.kind === 'tuple-destructuring') {
					this.evaluateTupleDestructuring(def);
				} else if (def.kind === 'record-destructuring') {
					this.evaluateRecordDestructuring(def);
				}
			}
			// Evaluate the main expression
			return this.evaluateExpression(expr.main);
		});
	}

	private containsVariable(expr: Expression, varName: string): boolean {
		switch (expr.kind) {
			case 'variable':
				return expr.name === varName;
			case 'function':
				// Don't check function parameters
				return this.containsVariable(expr.body, varName);
			case 'application':
				return (
					this.containsVariable(expr.func, varName) ||
					expr.args.some(arg => this.containsVariable(arg, varName))
				);
			case 'binary':
				return (
					this.containsVariable(expr.left, varName) ||
					this.containsVariable(expr.right, varName)
				);
			case 'if':
				return (
					this.containsVariable(expr.condition, varName) ||
					this.containsVariable(expr.then, varName) ||
					this.containsVariable(expr.else, varName)
				);
			case 'definition':
				return this.containsVariable(expr.value, varName);
			case 'mutable-definition':
				return this.containsVariable(expr.value, varName);
			case 'mutation':
				return (
					expr.target === varName || this.containsVariable(expr.value, varName)
				);
			case 'record':
				return expr.fields.some(field =>
					this.containsVariable(field.value, varName)
				);
			case 'tuple':
				return expr.elements.some(element =>
					this.containsVariable(element, varName)
				);
			case 'list':
				return expr.elements.some(element =>
					this.containsVariable(element, varName)
				);
			case 'pipeline':
				return expr.steps.some(step => this.containsVariable(step, varName));
			case 'match':
				return (
					this.containsVariable(expr.expression, varName) ||
					expr.cases.some(matchCase =>
						this.containsVariable(matchCase.expression, varName)
					)
				);
			case 'import':
			case 'accessor':
			case 'literal':
			case 'unit':
			case 'typed':
				return false;
			default:
				return false;
		}
	}

	// Efficient environment stack management
	private pushEnvironment(): void {
		this.environmentStack.push(this.environment);
		this.environment = new Map(this.environment);
	}

	private popEnvironment(): void {
		if (this.environmentStack[0]) {
			// biome-ignore lint/style/noNonNullAssertion: we checked
			this.environment = this.environmentStack.pop()!;
		}
	}

	private withNewEnvironment<T>(fn: () => T): T {
		this.pushEnvironment();
		try {
			return fn();
		} finally {
			this.popEnvironment();
		}
	}

	// Get the current environment (useful for debugging)
	getEnvironment(): Map<string, Value> {
		return new Map(
			Array.from(this.environment.entries()).map(([k, v]) => [
				k,
				isCell(v) ? v.value : v,
			])
		);
	}

	private expressionToString(expr: Expression): string {
		switch (expr.kind) {
			case 'literal':
				if (Array.isArray(expr.value)) {
					return `[${expr.value
						.map(e => this.expressionToString(e as Expression))
						.join(' ')}]`;
				}
				return String(expr.value);
			case 'variable':
				return expr.name;
			case 'function':
				return `fn ${expr.params.join(' ')} => ${this.expressionToString(
					expr.body
				)}`;
			case 'application':
				return `${this.expressionToString(expr.func)} ${expr.args
					.map(arg => this.expressionToString(arg))
					.join(' ')}`;
			case 'pipeline':
				return expr.steps
					.map(step => this.expressionToString(step))
					.join(' | ');
			case 'binary':
				return `${this.expressionToString(expr.left)} ${
					expr.operator
				} ${this.expressionToString(expr.right)}`;
			case 'if':
				return `if ${this.expressionToString(
					expr.condition
				)} then ${this.expressionToString(
					expr.then
				)} else ${this.expressionToString(expr.else)}`;
			case 'definition':
				return `${expr.name} = ${this.expressionToString(expr.value)}`;
			case 'mutable-definition':
				return `${expr.name} = ${this.expressionToString(expr.value)}`;
			case 'mutation':
				return `mut ${expr.target} = ${this.expressionToString(expr.value)}`;
			case 'import':
				return `import "${expr.path}"`;
			case 'record':
				return `{ ${expr.fields
					.map(
						field => `${field.name} = ${this.expressionToString(field.value)}`
					)
					.join(', ')} }`;
			case 'accessor':
				return `@${expr.field}${expr.optional ? '?' : ''}`;
			case 'where':
				return `${this.expressionToString(expr.main)} where (${expr.definitions
					.map(d => this.expressionToString(d))
					.join('; ')})`;
			case 'constraint-definition':
				return `constraint ${expr.name}`;
			case 'implement-definition':
				return `implement ${expr.constraintName}`;
			default:
				return 'unknown';
		}
	}

	// Check if a function name is a trait function
	private isTraitFunction(functionName: string): boolean {
		if (!this.traitRegistry) return false;

		// Check if any trait defines this function
		for (const traitDef of this.traitRegistry.definitions.values()) {
			if (traitDef.functions.has(functionName)) {
				return true;
			}
		}
		return false;
	}

	// Handle trait function application at runtime
	private evaluateTraitFunctionApplication(
		traitFunc: {
			name: string;
			partialArgs?: Value[];
			traitRegistry: TraitRegistry;
		},
		argExprs: Expression[]
	): Value {
		if (!this.traitRegistry) {
			throw new Error(
				`No trait registry available for trait function ${traitFunc.name}`
			);
		}

		// Evaluate the arguments to get their runtime values
		const argValues = argExprs.map(arg => this.evaluateExpression(arg));

		// For partial application, return a curried function that accumulates arguments
		// until we have enough information to do trait dispatch
		if (traitFunc.partialArgs) {
			// This is already a partially applied trait function - add more arguments
			const allArgs = [...traitFunc.partialArgs, ...argValues];
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				allArgs,
				traitFunc.traitRegistry
			);
		} else {
			// This is the first application - start accumulating arguments
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				argValues,
				this.traitRegistry
			);
		}
	}

	private resolveTraitFunctionWithArgs(
		functionName: string,
		argValues: Value[],
		traitRegistry: TraitRegistry
	): Value {
		// Get the type names of the arguments for trait resolution
		const argTypeNames = argValues.map(val => this.getValueTypeName(val));

		// Try to resolve the trait function based on different arguments
		// For Functor map: try the last argument (container) first
		const possibleDispatchIndices =
			argTypeNames.length > 1 ? [argTypeNames.length - 1, 0] : [0];

		for (const dispatchIndex of possibleDispatchIndices) {
			const dispatchTypeName = argTypeNames[dispatchIndex];
			if (dispatchTypeName === 'Unknown') continue;

			for (const [traitName, traitDef] of traitRegistry.definitions) {
				if (traitDef.functions.has(functionName)) {
					// First try user-defined implementations in the registry
					const traitImpls = traitRegistry.implementations.get(traitName);
					if (traitImpls) {
						const impl = traitImpls.get(dispatchTypeName);
						if (impl && impl.functions.has(functionName)) {
							// Found the implementation! Create a curried function call
							const implExpr = impl.functions.get(functionName)!;

							// Apply the implementation to all accumulated arguments
							let result = this.evaluateExpression(implExpr);
							for (const argValue of argValues) {
								if (isFunction(result)) {
									result = result.fn(argValue);
								} else if (isNativeFunction(result)) {
									result = result.fn(argValue);
								} else {
									throw new Error(
										`Cannot apply argument to non-function during trait resolution`
									);
								}
							}
							return result;
						}
					}
				}
			}
		}

		// If we get here, we don't have enough type info yet - return a partial application
		// that will try again when more arguments are provided
		if (argTypeNames.every(t => t === 'Unknown') || argTypeNames.length < 2) {
			return {
				tag: 'trait-function',
				name: functionName,
				traitRegistry: traitRegistry,
				partialArgs: argValues,
			};
		}

		// No implementation found even with type info
		const knownTypes = argTypeNames.filter(t => t !== 'Unknown');
		const typeStr = knownTypes.length > 0 ? knownTypes.join(', ') : 'Unknown';
		throw new Error(
			`No implementation of trait function ${functionName} for ${typeStr}`
		);
	}

	private getValueTypeName(value: Value): string {
		// Get a type name from a runtime value for constraint resolution
		if (isNumber(value)) return 'Float';
		if (isString(value)) return 'String';
		if (isBool(value)) return 'Bool';
		if (isList(value)) return 'List';
		if (isRecord(value)) return 'Record';
		if (isTuple(value)) return 'Tuple';
		if (isConstructor(value)) {
			// For ADT constructors, use the constructor name
			if (value.name === 'Some' || value.name === 'None') return 'Option';
			if (value.name === 'Ok' || value.name === 'Err') return 'Result';
			return value.name;
		}
		return 'Unknown';
	}

	private evaluateTypeDefinition(expr: TypeDefinitionExpression): Value {
		// Type definitions add constructors to the environment
		for (const _constructor of expr.constructors) {
			if (_constructor.args.length === 0) {
				// Nullary constructor: just create the constructor value
				const constructorValue = {
					tag: 'constructor',
					name: _constructor.name,
					args: [],
				} as Value;
				this.environment.set(_constructor.name, constructorValue);
			} else {
				// Create a simple constructor function that collects all arguments
				const createCurriedConstructor = (arity: number, name: string) => {
					const collectArgs = (collectedArgs: Value[] = []): Value => {
						return createFunction((nextArg: Value) => {
							const newArgs = [...collectedArgs, nextArg];
							if (newArgs.length === arity) {
								return { tag: 'constructor', name, args: newArgs } as Value;
							} else {
								return collectArgs(newArgs);
							}
						});
					};
					return collectArgs();
				};

				this.environment.set(
					_constructor.name,
					createCurriedConstructor(_constructor.args.length, _constructor.name)
				);
			}
		}

		// Type definitions evaluate to unit
		return createUnit();
	}

	private evaluateUserDefinedType(expr: UserDefinedTypeExpression): Value {
		// User-defined types are type-level definitions, similar to ADTs
		// They don't create runtime values, but could define type constructors
		// For now, they just evaluate to unit like type definitions
		// TODO: Implement type constructor functions for user-defined types
		
		return createUnit();
	}

	private evaluateMatch(expr: MatchExpression): Value {
		// Evaluate the expression being matched
		const value = this.evaluateExpression(expr.expression);

		// Try each case until one matches
		for (const matchCase of expr.cases) {
			const matchResult = this.tryMatchPattern(matchCase.pattern, value);
			if (matchResult.matched) {
				// Use environment stacking for pattern bindings
				return this.withNewEnvironment(() => {
					// Add bindings to environment
					for (const [name, boundValue] of matchResult.bindings) {
						this.environment.set(name, boundValue);
					}
					// Evaluate the case expression
					return this.evaluateExpression(matchCase.expression);
				});
			}
		}

		throw new Error('No pattern matched in match expression');
	}

	private tryMatchPattern(
		pattern: Pattern,
		value: Value
	): { matched: boolean; bindings: Map<string, Value> } {
		const bindings = new Map<string, Value>();

		switch (pattern.kind) {
			case 'wildcard':
				// Wildcard always matches
				return { matched: true, bindings };

			case 'variable':
				// Variable always matches and binds the value
				bindings.set(pattern.name, value);
				return { matched: true, bindings };

			case 'constructor': {
				// Constructor pattern only matches constructor values
				if (value.tag !== 'constructor') {
					return { matched: false, bindings };
				}

				// Check constructor name
				if (value.name !== pattern.name) {
					return { matched: false, bindings };
				}

				// Check argument count
				if (pattern.args.length !== value.args.length) {
					return { matched: false, bindings };
				}

				// Match each argument
				for (let i = 0; i < pattern.args.length; i++) {
					const argMatch = this.tryMatchPattern(pattern.args[i], value.args[i]);
					if (!argMatch.matched) {
						return { matched: false, bindings };
					}

					// Merge bindings
					for (const [name, boundValue] of argMatch.bindings) {
						bindings.set(name, boundValue);
					}
				}

				return { matched: true, bindings };
			}

			case 'literal': {
				// Literal pattern matches if values are equal
				let matches = false;

				if (typeof pattern.value === 'number' && isNumber(value)) {
					matches = pattern.value === value.value;
				} else if (typeof pattern.value === 'string' && isString(value)) {
					matches = pattern.value === value.value;
				}

				return { matched: matches, bindings };
			}

			case 'tuple': {
				// Tuple pattern only matches tuple values
				if (value.tag !== 'tuple') {
					return { matched: false, bindings };
				}

				// Check element count
				if (pattern.elements.length !== value.values.length) {
					return { matched: false, bindings };
				}

				// Match each element
				for (let i = 0; i < pattern.elements.length; i++) {
					const elementMatch = this.tryMatchPattern(
						pattern.elements[i],
						value.values[i]
					);
					if (!elementMatch.matched) {
						return { matched: false, bindings };
					}

					// Merge bindings
					for (const [name, boundValue] of elementMatch.bindings) {
						bindings.set(name, boundValue);
					}
				}

				return { matched: true, bindings };
			}

			case 'record': {
				// Record pattern only matches record values
				if (value.tag !== 'record') {
					return { matched: false, bindings };
				}

				// Match each field pattern
				for (const field of pattern.fields) {
					const fieldValue = value.fields[field.fieldName];
					if (fieldValue === undefined) {
						// Field doesn't exist in the value - pattern doesn't match
						return { matched: false, bindings };
					}

					const fieldMatch = this.tryMatchPattern(field.pattern, fieldValue);
					if (!fieldMatch.matched) {
						return { matched: false, bindings };
					}

					// Merge bindings
					for (const [name, boundValue] of fieldMatch.bindings) {
						bindings.set(name, boundValue);
					}
				}

				return { matched: true, bindings };
			}

			default:
				throw new Error(
					`Unsupported pattern kind: ${(pattern as Pattern).kind}`
				);
		}
	}

	// Helper to ensure the result is properly wrapped in the same monad type as the input
	private ensureMonadicResult(result: Value, originalMonad: Value): Value {
		if (!isConstructor(originalMonad)) {
			return result;
		}

		// If result is already a constructor (likely already wrapped), return as-is
		if (isConstructor(result)) {
			return result;
		}

		// Otherwise, wrap the result in the same monad type
		if (originalMonad.name === 'Some' || originalMonad.name === 'None') {
			// Option monad: wrap in Some
			return createConstructor('Some', [result]);
		} else if (originalMonad.name === 'Ok' || originalMonad.name === 'Err') {
			// Result monad: wrap in Ok
			return createConstructor('Ok', [result]);
		}

		// For other types, just return the result unwrapped
		return result;
	}

	// Apply trait function directly with runtime values (used by $ operator)
	private applyTraitFunctionWithValues(
		traitFunc: {
			name: string;
			partialArgs?: Value[];
			traitRegistry: TraitRegistry;
		},
		argValues: Value[]
	): Value {
		if (!this.traitRegistry) {
			throw new Error(
				`No trait registry available for trait function ${traitFunc.name}`
			);
		}

		// For partial application, return a curried function that accumulates arguments
		// until we have enough information to do trait dispatch
		if (traitFunc.partialArgs) {
			// This is already a partially applied trait function - add more arguments
			const allArgs = [...traitFunc.partialArgs, ...argValues];
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				allArgs,
				traitFunc.traitRegistry
			);
		} else {
			// This is the first application - start accumulating arguments
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				argValues,
				traitFunc.traitRegistry
			);
		}
	}
}