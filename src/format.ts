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
} from './evaluator';

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
		return `[${value.values.map(formatValue).join('; ')}]`;
	}
	if (isTuple(value)) {
		return `{${value.values.map(formatValue).join('; ')}}`;
	}
	if (isRecord(value)) {
		return `{${Object.entries(value.fields)
			.map(([k, v]) => `@${k} ${formatValue(v)}`)
			.join('; ')}}`;
	}
	if (isFunction(value)) {
		return '<function>';
	}
	if (isNativeFunction(value)) {
		return `<native:${value.name}>`;
	}
	if (isUnit(value)) {
		return '()';
	}
	if (isConstructor(value)) {
		if (value.args.length === 0) {
			return value.name;
		} else {
			return `${value.name} ${value.args.map(formatValue).join(' ')}`;
		}
	}
	return '<unknown>';
}

export default formatValue;
