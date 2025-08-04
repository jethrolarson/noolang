import { TraitRegistry } from '../typer/trait-system';

// Value types (Phase 6: functions and native functions as tagged union)
export type Value =
	| NumberValue
	| StringValue
	| TupleValue
	| ListValue
	| RecordValue
	| FunctionValue
	| NativeValue
	| ConstructorValue
	| TraitFunctionValue
	| UnitValue;

export type NumberValue = { tag: 'number'; value: number };
export type StringValue = { tag: 'string'; value: string };
export type TupleValue = { tag: 'tuple'; values: Value[] };
export type ListValue = { tag: 'list'; values: Value[] };
export type RecordValue = { tag: 'record'; fields: { [key: string]: Value } };
export type FunctionValue = {
	tag: 'function';
	fn: (...args: Value[]) => Value;
};
export type NativeValue = { tag: 'native'; name: string; fn: unknown };
export type ConstructorValue = {
	tag: 'constructor';
	name: string;
	args: Value[];
};

export type TraitFunctionValue = {
	tag: 'trait-function';
	name: string;
	traitRegistry: TraitRegistry;
	partialArgs?: Value[];
};
export type NativeFunctionValue = {
	tag: 'native';
	name: string;
	fn: (...args: Value[]) => Value;
};
export type UnitValue = { tag: 'unit' };

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

type BoolValue = { tag: 'constructor'; name: 'True' | 'False'; args: [] };

export const isBool = (value: Value): value is BoolValue =>
	value.tag === 'constructor' &&
	(value.name === 'True' || value.name === 'False');

export const boolValue = (value: Value): boolean => {
	if (value.tag === 'constructor' && value.name === 'True') return true;
	if (value.tag === 'constructor' && value.name === 'False') return false;
	throw new Error(`Expected Bool constructor, got ${value.tag}`);
};

export const isList = (value: Value): value is ListValue =>
	value.tag === 'list';

export const createList = (values: Value[]): Value => ({ tag: 'list', values });

export const isRecord = (value: Value): value is RecordValue =>
	value.tag === 'record';

export const createRecord = (fields: { [key: string]: Value }): Value => ({
	tag: 'record',
	fields,
});

export const isFunction = (value: Value): value is FunctionValue =>
	value.tag === 'function';

// Helper to check if a value is any kind of callable function
export const isAnyFunction = (
	value: Value
): value is FunctionValue | NativeFunctionValue | TraitFunctionValue =>
	isFunction(value) || isNativeFunction(value) || isTraitFunctionValue(value);

export const createFunction = (
	fn: (...args: Value[]) => Value
): FunctionValue => ({
	tag: 'function',
	fn,
});

export const isNativeFunction = (value: Value): value is NativeFunctionValue =>
	value.tag === 'native';

// using `any` because we don't know the curried arity of the function. They all eventually return `Value`
export const createNativeFunction = (
	name: string,
	fn: (a: Value) => Value | ((b: Value) => any)
): NativeFunctionValue => ({
	tag: 'native',
	name,
	fn: (arg: Value) => {
		const result = fn(arg);
		// If the result is a function, wrap it as a native function
		if (typeof result === 'function') {
			return createNativeFunction(`${name}_partial`, result);
		}
		return result;
	},
});

export const isTuple = (value: Value): value is TupleValue =>
	value.tag === 'tuple';

export const createTuple = (values: Value[]): TupleValue => ({
	tag: 'tuple',
	values,
});

export const isUnit = (value: Value): value is UnitValue =>
	value.tag === 'unit';

export const createUnit = (): UnitValue => ({ tag: 'unit' });

export const isConstructor = (value: Value): value is ConstructorValue =>
	value.tag === 'constructor';

export const createConstructor = (
	name: string,
	args: Value[]
): ConstructorValue => ({
	tag: 'constructor',
	name,
	args,
});

export const isTraitFunctionValue = (
	value: Value
): value is TraitFunctionValue => value.tag === 'trait-function';

export function valueToString(value: Value): string {
	if (isNumber(value)) {
		return String(value.value);
	} else if (isString(value)) {
		return `"${value.value}"`;
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
	} else if (isBool(value)) {
		return boolValue(value) ? 'True' : 'False';
	} else if (isConstructor(value)) {
		if (value.args.length === 0) {
			return value.name;
		} else {
			return `${value.name} ${value.args.map(valueToString).join(' ')}`;
		}
	} else if (isUnit(value)) {
		return 'unit';
	}
	return 'No way to stringify this value is defined';
}
