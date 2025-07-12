// Noolang value pretty-printer/formatter
// Usage: formatValue(value: Value): string

import {
  isNumber,
  isString,
  isBoolean,
  isList,
  isRecord,
  isTuple,
  isFunction,
  isNativeFunction,
  isUnit,
  Value
} from './evaluator';

export function formatValue(value: Value): string {
  if (isNumber(value)) {
    return value.value.toString();
  }
  if (isString(value)) {
    // Escape quotes and backslashes
    return '"' + value.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  if (isBoolean(value)) {
    return value.value ? 'true' : 'false';
  }
  if (isList(value)) {
    return '[' + value.values.map(formatValue).join('; ') + ']';
  }
  if (isTuple && isTuple(value)) {
    return '{' + value.values.map(formatValue).join('; ') + '}';
  }
  if (isRecord(value)) {
    return '{ ' + Object.entries(value.fields)
      .map(([k, v]) => `@${k} ${formatValue(v)}`)
      .join('; ') + ' }';
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
  return '<unknown>';
}

export default formatValue; 