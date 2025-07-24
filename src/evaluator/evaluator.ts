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
	ImportExpression,
	RecordExpression,
	AccessorExpression,
	TypeDefinitionExpression,
	MatchExpression,
	Pattern,
	WhereExpression,
	MutableDefinitionExpression,
	MutationExpression,
	ConstraintDefinitionExpression,
	ImplementDefinitionExpression,
	Type,
} from '../ast';
import type { TypeState } from '../typer/types';

import { createError } from '../errors';
import { formatValue } from '../format';
import { Lexer } from '../lexer/lexer';
import { parse } from '../parser/parser';

// Value types (Phase 6: functions and native functions as tagged union)
export type Value =
	| { tag: 'number'; value: number }
	| { tag: 'string'; value: string }
	| { tag: 'tuple'; values: Value[] }
	| { tag: 'list'; values: Value[] }
	| { tag: 'record'; fields: { [key: string]: Value } }
	| { tag: 'function'; fn: (...args: Value[]) => Value }
	| { tag: 'native'; name: string; fn: unknown }
	| { tag: 'constructor'; name: string; args: Value[] }
	| { tag: 'trait-function'; name: string; traitRegistry: any }
	| { tag: 'unit' };

// --- Mutable Cell type ---
export type Cell = { cell: true; value: Value };
export const isCell = (val: any): val is Cell =>
	val && typeof val === 'object' && val.cell === true && 'value' in val;

export const createCell = (value: Value): Cell => ({ cell: true, value });

export const isNumber = (
	value: Value
): value is { tag: 'number'; value: number } => value.tag === 'number';

export const createNumber = (value: number): Value => ({
	tag: 'number',
	value,
});

export const isString = (
	value: Value
): value is { tag: 'string'; value: string } => value.tag === 'string';

export const createString = (value: string): Value => ({
	tag: 'string',
	value,
});

export const createTrue = (): Value => ({
	tag: 'constructor',
	name: 'True',
	args: [],
});

export const createFalse = (): Value => ({
	tag: 'constructor',
	name: 'False',
	args: [],
});

export const createBool = (value: boolean): Value =>
	createConstructor(value ? 'True' : 'False', []);

export const isBool = (
	value: Value
): value is { tag: 'constructor'; name: 'True' | 'False'; args: [] } =>
	value.tag === 'constructor' &&
	(value.name === 'True' || value.name === 'False');

export const boolValue = (value: Value): boolean => {
	if (value.tag === 'constructor' && value.name === 'True') return true;
	if (value.tag === 'constructor' && value.name === 'False') return false;
	throw new Error(`Expected Bool constructor, got ${value.tag}`);
};

export const isList = (
	value: Value
): value is { tag: 'list'; values: Value[] } => value.tag === 'list';

export const createList = (values: Value[]): Value => ({ tag: 'list', values });

export const isRecord = (
	value: Value
): value is { tag: 'record'; fields: { [key: string]: Value } } =>
	value.tag === 'record';

export const createRecord = (fields: { [key: string]: Value }): Value => ({
	tag: 'record',
	fields,
});

export const isFunction = (
	value: Value
): value is { tag: 'function'; fn: (...args: Value[]) => Value } =>
	value.tag === 'function';

export const createFunction = (fn: (...args: Value[]) => Value): Value => ({
	tag: 'function',
	fn,
});

export const isNativeFunction = (
	value: Value
): value is { tag: 'native'; name: string; fn: (...args: Value[]) => Value } =>
	value.tag === 'native';

export const createNativeFunction = (name: string, fn: any): Value => {
	const wrap = (fn: any, curriedName: string): Value => ({
		tag: 'native',
		name: curriedName,
		fn: (...args: Value[]) => {
			const result = fn(...args);
			if (typeof result === 'function') {
				return wrap(result, curriedName + '_curried');
			}
			return result;
		},
	});
	return wrap(fn, name);
};

export const isTuple = (
	value: Value
): value is { tag: 'tuple'; values: Value[] } => value.tag === 'tuple';

export const createTuple = (values: Value[]): Value => ({
	tag: 'tuple',
	values,
});

export const isUnit = (value: Value): value is { tag: 'unit' } =>
	value.tag === 'unit';

export const createUnit = (): Value => ({ tag: 'unit' });

export const isConstructor = (
	value: Value
): value is { tag: 'constructor'; name: string; args: Value[] } =>
	value.tag === 'constructor';

export const createConstructor = (name: string, args: Value[]): Value => ({
	tag: 'constructor',
	name,
	args,
});

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

export class Evaluator {
	public environment: Environment;
	private environmentStack: Environment[]; // Stack for efficient scoping
	private currentFileDir?: string; // Track the directory of the current file being evaluated
	private fs: typeof defaultFs;
	private path: typeof defaultPath;
	private traitRegistry?: any; // NEW: Trait registry for runtime trait resolution

	constructor(opts?: { fs?: typeof defaultFs; path?: typeof defaultPath; traitRegistry?: any }) {
		this.fs = opts?.fs ?? defaultFs;
		this.path = opts?.path ?? defaultPath;
		this.traitRegistry = opts?.traitRegistry;
		this.environment = new Map();
		this.environmentStack = [];
		this.initializeBuiltins();
		this.loadStdlib();
	}

	private initializeBuiltins(): void {
		// Arithmetic operations
		this.environment.set(
			'+',
			createNativeFunction('+', (a: Value) => (b: Value) => {
				if (isNumber(a) && isNumber(b)) return createNumber(a.value + b.value);
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
				if (isFunction(func)) return func.fn(value);
				throw new Error(
					`Cannot apply non-function in thrush: ${func?.tag || 'unit'}`
				);
			})
		);

		// Left-to-right composition
		this.environment.set(
			'|>',
			createNativeFunction('|>', (f: Value) => (g: Value) => {
				if (isFunction(f) && isFunction(g)) {
					return createFunction((x: Value) => g.fn(f.fn(x)));
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
				if (isFunction(f) && isFunction(g)) {
					return createFunction((x: Value) => f.fn(g.fn(x)));
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
				if (isFunction(func)) return func.fn(arg);
				if (isNativeFunction(func)) return func.fn(arg);
				throw new Error(
					`Cannot apply non-function in dollar operator: ${func?.tag || 'unit'}`
				);
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
				if (isFunction(func) && isList(list)) {
					return createList(list.values.map((item: Value) => func.fn(item)));
				}
				throw new Error('map requires a function and a list');
			})
		);
		this.environment.set(
			'filter',
			createNativeFunction('filter', (pred: Value) => (list: Value) => {
				if (isFunction(pred) && isList(list)) {
					return createList(
						list.values.filter((item: Value) => {
							const result = pred.fn(item);
							if (isBool(result)) {
								return boolValue(result);
							}
							// For non-boolean results, treat as truthy/falsy
							return !isUnit(result);
						})
					);
				}
				throw new Error('filter requires a predicate function and a list');
			})
		);
		this.environment.set(
			'reduce',
			createNativeFunction(
				'reduce',
				(func: Value) => (initial: Value) => (list: Value) => {
					if (isFunction(func) && isList(list)) {
						return list.values.reduce((acc: Value, item: Value) => {
							const partial = func.fn(acc);
							if (isFunction(partial)) {
								return partial.fn(item);
							}
							throw new Error(
								'reduce function must return a function after first argument'
							);
						}, initial);
					}
					throw new Error(
						'reduce requires a function, initial value, and a list'
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
				if (isTuple(tuple)) {
					return createNumber(tuple.values.length);
				}
				throw new Error('tupleLength requires a tuple');
			})
		);
		this.environment.set(
			'tupleIsEmpty',
			createNativeFunction('tupleIsEmpty', (tuple: Value) => {
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
			'primitive_int_eq',
			createNativeFunction('primitive_int_eq', (a: Value) => (b: Value) => {
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
			'intToString',
			createNativeFunction('intToString', (n: Value) => {
				if (isNumber(n)) {
					return createString(n.value.toString());
				}
				throw new Error('intToString requires a number');
			})
		);
	}

	addConstraintFunctions(typeState: TypeState): void {
		// Add specialized constraint functions from type checking to runtime environment
		// Legacy constraint system removed - this is now a no-op
		// TODO: Replace with trait function dispatch when needed
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
			case 'match':
				return this.evaluateMatch(expr as MatchExpression);
			case 'constraint-definition':
				return this.evaluateConstraintDefinition(
					expr as ConstraintDefinitionExpression
				);
			case 'implement-definition':
				return this.evaluateImplementDefinition(
					expr as ImplementDefinitionExpression
				);
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
			if (this.traitRegistry && this.isTraitFunction(expr.name)) {
				// Return a special trait function value that will be resolved during application
				return {
					tag: 'trait-function',
					name: expr.name,
					traitRegistry: this.traitRegistry
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
			return this.evaluateTraitFunctionApplication(func as any, expr.args);
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
						`Cannot apply argument to non-function: ${typeof result}`
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

		if (expr.steps.length === 1) {
			return this.evaluateExpression(expr.steps[0]);
		}

		// Start with the first function
		let composed = this.evaluateExpression(expr.steps[0]);

		// Compose with each subsequent function
		for (let i = 1; i < expr.steps.length; i++) {
			const nextFunc = this.evaluateExpression(expr.steps[i]);

			if (isFunction(composed) && isFunction(nextFunc)) {
				// Compose: nextFunc(composed(x))
				const composedFn = composed as {
					tag: 'function';
					fn: (...args: Value[]) => Value;
				};
				const nextFuncFn = nextFunc as {
					tag: 'function';
					fn: (...args: Value[]) => Value;
				};
				composed = createFunction((x: Value) =>
					nextFuncFn.fn(composedFn.fn(x))
				);
			} else if (isNativeFunction(composed) && isNativeFunction(nextFunc)) {
				// Compose: nextFunc(composed(x))
				const composedFn = composed as {
					tag: 'native';
					name: string;
					fn: (...args: Value[]) => Value;
				};
				const nextFuncFn = nextFunc as {
					tag: 'native';
					name: string;
					fn: (...args: Value[]) => Value;
				};
				composed = createFunction((x: Value) =>
					nextFuncFn.fn(composedFn.fn(x))
				);
			} else if (isFunction(composed) && isNativeFunction(nextFunc)) {
				// Compose: nextFunc(composed(x))
				const composedFn = composed as {
					tag: 'function';
					fn: (...args: Value[]) => Value;
				};
				const nextFuncFn = nextFunc as {
					tag: 'native';
					name: string;
					fn: (...args: Value[]) => Value;
				};
				composed = createFunction((x: Value) =>
					nextFuncFn.fn(composedFn.fn(x))
				);
			} else if (isNativeFunction(composed) && isFunction(nextFunc)) {
				// Compose: nextFunc(composed(x))
				const composedFn = composed as {
					tag: 'native';
					name: string;
					fn: (...args: Value[]) => Value;
				};
				const nextFuncFn = nextFunc as {
					tag: 'function';
					fn: (...args: Value[]) => Value;
				};
				composed = createFunction((x: Value) =>
					nextFuncFn.fn(composedFn.fn(x))
				);
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
			// Fall back to calling the stdlib bind function directly
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			// Check that right operand is a function
			if (!isFunction(right) && !isNativeFunction(right)) {
				throw new Error(
					`Cannot apply non-function in safe thrush: ${valueToString(right)}`
				);
			}

			// Try to call the stdlib bind function directly as fallback
			let bindFunction = this.environment.get('bind');
			if (bindFunction) {
				// Handle Cell wrapper
				if (isCell(bindFunction)) {
					bindFunction = bindFunction.value;
				}

				if (isFunction(bindFunction)) {
					const partiallyApplied = bindFunction.fn(left);
					if (isFunction(partiallyApplied)) {
						const result = partiallyApplied.fn(right);
						// Check if result needs to be wrapped in the monad
						return this.ensureMonadicResult(result, left);
					} else if (isNativeFunction(partiallyApplied)) {
						const result = partiallyApplied.fn(right);
						return this.ensureMonadicResult(result, left);
					}
				} else if (isNativeFunction(bindFunction)) {
					const partiallyApplied = bindFunction.fn(left);
					if (isFunction(partiallyApplied)) {
						const result = partiallyApplied.fn(right);
						return this.ensureMonadicResult(result, left);
					} else if (isNativeFunction(partiallyApplied)) {
						const result = partiallyApplied.fn(right);
						return this.ensureMonadicResult(result, left);
					}
				}
			}

			throw new Error(
				'Safe thrush operator (|?) failed: no bind function available'
			);
		} else if (expr.operator === '$') {
			// Handle dollar operator (low precedence function application)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(left)) {
				return left.fn(right);
			} else if (isNativeFunction(left)) {
				return left.fn(right);
			} else {
				throw new Error(
					`Cannot apply non-function in dollar operator: ${valueToString(left)}`
				);
			}
		} else if (expr.operator === '|>') {
			// Handle pipeline operator (left-to-right composition)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(left) && isFunction(right)) {
				// Left-to-right composition: g(f(x))
				return createFunction((x: Value) => right.fn(left.fn(x)));
			} else if (isNativeFunction(left) && isNativeFunction(right)) {
				// Left-to-right composition: g(f(x))
				return createFunction((x: Value) => right.fn(left.fn(x)));
			} else if (isFunction(left) && isNativeFunction(right)) {
				// Left-to-right composition: g(f(x))
				return createFunction((x: Value) => right.fn(left.fn(x)));
			} else if (isNativeFunction(left) && isFunction(right)) {
				// Left-to-right composition: g(f(x))
				return createFunction((x: Value) => right.fn(left.fn(x)));
			} else {
				throw new Error(
					`Cannot compose non-functions in pipeline: ${valueToString(
						left
					)} and ${valueToString(right)}`
				);
			}
		} else if (expr.operator === '<|') {
			// Handle right-to-left composition operator
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(left) && isFunction(right)) {
				// Right-to-left: f(g(x))
				return createFunction((x: Value) => left.fn(right.fn(x)));
			} else if (isNativeFunction(left) && isNativeFunction(right)) {
				// Right-to-left: f(g(x))
				return createFunction((x: Value) => left.fn(right.fn(x)));
			} else {
				throw new Error(
					`Cannot compose non-functions: ${valueToString(
						left
					)} and ${valueToString(right)}`
				);
			}
		} else {
			// Handle other binary operators (arithmetic, comparison, etc.)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);
			const leftVal = isCell(left) ? left.value : left;
			const rightVal = isCell(right) ? right.value : right;

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
			const tempEvaluator = new Evaluator({ fs: this.fs, path: this.path });
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
		return createNativeFunction(`@${expr.field}`, (record: Value): Value => {
			if (isRecord(record)) {
				const field = expr.field;
				if (field in record.fields) {
					return record.fields[field];
				}
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
				return `@${expr.field}`;
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

	private evaluateConstraintDefinition(
		expr: ConstraintDefinitionExpression
	): Value {
		// NEW TRAIT SYSTEM: Constraint definitions don't need runtime registration
		// The trait functions will be resolved at call sites using the trait registry
		// This just returns unit - trait definitions are purely for type checking
		return createUnit();
	}

	// NEW: Check if a function name is a trait function
	private isTraitFunction(functionName: string): boolean {
		if (!this.traitRegistry) return false;
		
		// Check if any trait defines this function
		for (const [traitName, traitDef] of this.traitRegistry.definitions) {
			if (traitDef.functions.has(functionName)) {
				return true;
			}
		}
		return false;
	}

	// NEW: Handle trait function application at runtime
	private evaluateTraitFunctionApplication(traitFunc: any, argExprs: Expression[]): Value {
		if (!this.traitRegistry) {
			throw new Error(`No trait registry available for trait function ${traitFunc.name}`);
		}

		// Evaluate the arguments to get their runtime values
		const argValues = argExprs.map(arg => this.evaluateExpression(arg));
		
		// Get the type names of the arguments for trait resolution
		const argTypeNames = argValues.map(val => this.getValueTypeName(val));
		
		// Try to resolve the trait function
		for (const [traitName, traitDef] of this.traitRegistry.definitions) {
			if (traitDef.functions.has(traitFunc.name)) {
				// Check if we have an implementation for the first argument's type
				const traitImpls = this.traitRegistry.implementations.get(traitName);
				if (traitImpls && argTypeNames.length > 0) {
					const impl = traitImpls.get(argTypeNames[0]);
					if (impl && impl.functions.has(traitFunc.name)) {
						// Found the implementation! Evaluate it with the arguments
						const implExpr = impl.functions.get(traitFunc.name);
						
						// Create an application expression with the implementation
						const appExpr: ApplicationExpression = {
							kind: 'application',
							func: implExpr,
							args: argExprs,
							location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
						};
						
						return this.evaluateApplication(appExpr);
					}
				}
			}
		}
		
		// No implementation found
		const argTypeName = argTypeNames.length > 0 ? argTypeNames[0] : 'Unknown';
		throw new Error(`No implementation of trait function ${traitFunc.name} for ${argTypeName}`);
	}

	private getValueTypeName(value: Value): string {
		// Get a type name from a runtime value for constraint resolution
		if (isNumber(value)) return 'Int';
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

	private evaluateImplementDefinition(
		expr: ImplementDefinitionExpression
	): Value {
		// NEW TRAIT SYSTEM: Implementation definitions don't need runtime registration
		// The trait implementations are stored in the trait registry during type checking
		// and resolved at call sites. This just returns unit.
		return createUnit();
	}

	private typeExpressionToString(typeExpr: Type): string {
		// Convert type expression to string for generating specialized names
		if (typeExpr.kind === 'primitive') {
			return typeExpr.name;
		} else if (typeExpr.kind === 'variable') {
			return typeExpr.name;
		} else if (typeExpr.kind === 'list') {
			return `List ${this.typeExpressionToString(typeExpr.element)}`;
		} else if (typeExpr.kind === 'function') {
			// For function types, just use a simple representation
			return 'Function';
		}
		// Fallback
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
}

// Move valueToString to a standalone function
function valueToString(value: Value): string {
	if (isNumber(value)) {
		return String(value.value);
	} else if (isString(value)) {
		return `"${value.value}"`;
	} else if (isBool(value)) {
		return boolValue(value) ? 'True' : 'False';
	} else if (isList(value)) {
		return `[${value.values.map(valueToString).join('; ')}]`;
	} else if (isTuple(value)) {
		return `{${value.values.map(valueToString).join('; ')}}`;
	} else if (isRecord(value)) {
		const fields = Object.entries(value.fields)
			.map(([k, v]) => `@${k} ${valueToString(v)}`)
			.join('; ');
		return `{${fields}}`;
	} else if (isFunction(value)) {
		return '<function>';
	} else if (isNativeFunction(value)) {
		return `<native:${value.name}>`;
	} else if (isConstructor(value)) {
		if (value.args.length === 0) {
			return value.name;
		} else {
			return `${value.name} ${value.args.map(valueToString).join(' ')}`;
		}
	} else if (isUnit(value)) {
		return 'unit';
	}
	return '[object Object]';
}
