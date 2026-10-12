import type {
	DestructuringElement,
	Expression,
	RecordDestructuringExpression,
	RecordDestructuringField,
	RecordDestructuringPattern,
	TupleDestructuringExpression,
	TupleDestructuringPattern,
} from '../ast';
import type { RecordValue, TupleValue, Value } from './evaluator-utils';

type DestructuringContext = {
	evaluateExpression: (expression: Expression) => Value;
	bind: (name: string, value: Value) => void;
};

const extractTupleElements = (
	pattern: TupleDestructuringPattern,
	tupleValue: TupleValue,
	bind: DestructuringContext['bind']
): void => {
	if (pattern.elements.length !== tupleValue.values.length) {
		throw new Error(
			`Nested tuple destructuring length mismatch: pattern has ${pattern.elements.length} elements but value has ${tupleValue.values.length}`
		);
	}

	for (let i = 0; i < pattern.elements.length; i++) {
		const element = pattern.elements[i];
		const elementValue = tupleValue.values[i];

		if (element.kind === 'variable') {
			bind(element.name, elementValue);
		} else if (element.kind === 'nested-tuple') {
			if (elementValue.tag !== 'tuple') {
				throw new Error(
					`Expected tuple value for nested tuple destructuring at position ${i}, got ${elementValue.tag}`
				);
			}
			extractTupleElements(element.pattern, elementValue, bind);
		} else if (element.kind === 'nested-record') {
			if (elementValue.tag !== 'record') {
				throw new Error(
					`Expected record value for nested record destructuring at position ${i}, got ${elementValue.tag}`
				);
			}
			extractRecordFields(element.pattern, elementValue, bind);
		} else {
			throw new Error(
				`Unknown destructuring element kind: ${(element as DestructuringElement).kind}`
			);
		}
	}
};

const extractRecordFields = (
	pattern: RecordDestructuringPattern,
	recordValue: RecordValue,
	bind: DestructuringContext['bind']
): void => {
	for (const field of pattern.fields) {
		if (field.kind === 'shorthand') {
			if (!(field.fieldName in recordValue.fields)) {
				throw new Error(`Field '${field.fieldName}' not found in record`);
			}
			bind(field.fieldName, recordValue.fields[field.fieldName]);
		} else if (field.kind === 'rename') {
			if (!(field.fieldName in recordValue.fields)) {
				throw new Error(`Field '${field.fieldName}' not found in record`);
			}
			bind(field.localName, recordValue.fields[field.fieldName]);
		} else if (field.kind === 'nested-tuple') {
			if (!(field.fieldName in recordValue.fields)) {
				throw new Error(`Field '${field.fieldName}' not found in record`);
			}
			const fieldValue = recordValue.fields[field.fieldName];
			if (fieldValue.tag !== 'tuple') {
				throw new Error(
					`Expected tuple value for nested tuple destructuring in field '${field.fieldName}', got ${fieldValue.tag}`
				);
			}
			extractTupleElements(field.pattern, fieldValue, bind);
		} else if (field.kind === 'nested-record') {
			if (!(field.fieldName in recordValue.fields)) {
				throw new Error(`Field '${field.fieldName}' not found in record`);
			}
			const fieldValue = recordValue.fields[field.fieldName];
			if (fieldValue.tag !== 'record') {
				throw new Error(
					`Expected record value for nested record destructuring in field '${field.fieldName}', got ${fieldValue.tag}`
				);
			}
			extractRecordFields(field.pattern, fieldValue, bind);
		} else {
			throw new Error(
				`Unknown record destructuring field kind: ${(field as RecordDestructuringField).kind}`
			);
		}
	}
};

export const evaluateTupleDestructuring = (
	expr: TupleDestructuringExpression,
	context: DestructuringContext
): Value => {
	const value = context.evaluateExpression(expr.value);
	if (value.tag !== 'tuple') {
		throw new Error('Expected tuple value for tuple destructuring');
	}
	if (expr.pattern.elements.length !== value.values.length) {
		throw new Error(
			`Tuple destructuring length mismatch: pattern has ${expr.pattern.elements.length} elements but value has ${value.values.length}`
		);
	}

	extractTupleElements(expr.pattern, value, context.bind);
	return value;
};

export const evaluateRecordDestructuring = (
	expr: RecordDestructuringExpression,
	context: DestructuringContext
): Value => {
	const value = context.evaluateExpression(expr.value);
	if (value.tag !== 'record') {
		throw new Error('Expected record value for record destructuring');
	}

	extractRecordFields(expr.pattern, value, context.bind);
	return value;
};
