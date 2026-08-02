// Noolang value pretty-printer/formatter
// Usage: formatValue(value: Value): string

import {
	isNumber,
	isString,
	isBool,
	isList,
	isRecord,
	isTuple,
	isFunction,
	isNativeFunction,
	isUnit,
	isConstructor,
	type Value,
	boolValue,
} from './evaluator/evaluator';

// A constructor argument that is itself a multi-arg constructor application
// needs parens, or nesting depth is ambiguous: `Cons 2 Cons 3 Cons 4 Nil`
// reads as one flat application, not `Cons 2 (Cons 3 (Cons 4 Nil))`.
function formatConstructorArg(value: Value): string {
	const formatted = formatValue(value);
	return isConstructor(value) && value.args.length > 0 ? `(${formatted})` : formatted;
}

export function formatValue(value: Value): string {
	if (isNumber(value)) {
		return value.value.toString();
	}
	if (isString(value)) {
		// Escape quotes and backslashes
		return `"${value.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	if (isBool(value)) {
		return boolValue(value) ? 'True' : 'False';
	}
	if (isList(value)) {
		return `[${value.values.map(formatValue).join(', ')}]`;
	}
	if (isTuple(value)) {
		return `{${value.values.map(formatValue).join(', ')}}`;
	}
	if (isRecord(value)) {
		return `{${Object.entries(value.fields)
			.map(([k, v]) => `@${k} ${formatValue(v)}`)
			.join(', ')}}`;
	}
	if (isFunction(value)) {
		return '<function>';
	}
	if (value.tag === 'trait-function') {
		return '<function>';
	}
	if (isNativeFunction(value)) {
		return `<native:${value.name}>`;
	}
	if (isUnit(value)) {
		return '{}';
	}
	if (isConstructor(value)) {
		if (value.args.length === 0) {
			return value.name;
		} else {
			return `${value.name} ${value.args.map(formatConstructorArg).join(' ')}`;
		}
	}
	return '<unknown>';
}

import type { Type } from './ast';

// Used by literate `assert: true` checking (src/literate-assert.ts) to
// render the `value : type` shape that `# =>` annotations compare against.
export function formatValueWithType(
	value: Value,
	type: Type | undefined,
	typeToString: (t: Type, sub: Map<string, Type>) => string,
	substitution: Map<string, Type>
): string {
	const valueStr = formatValue(value);
	if (!type) return valueStr;
	return `${valueStr} : ${typeToString(type, substitution)}`;
}

export default formatValue;
