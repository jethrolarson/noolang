import type { Pattern } from '../ast';
import { isNumber, isString, type Value } from './evaluator-utils';

export type MatchResult = {
	matched: boolean;
	bindings: Map<string, Value>;
};

export const matchPattern = (pattern: Pattern, value: Value): MatchResult => {
	const bindings = new Map<string, Value>();

	switch (pattern.kind) {
		case 'wildcard':
			return { matched: true, bindings };

		case 'variable':
			bindings.set(pattern.name, value);
			return { matched: true, bindings };

		case 'constructor': {
			if (value.tag !== 'constructor') {
				return { matched: false, bindings };
			}
			if (value.name !== pattern.name) {
				return { matched: false, bindings };
			}
			if (pattern.args.length !== value.args.length) {
				return { matched: false, bindings };
			}

			for (let i = 0; i < pattern.args.length; i++) {
				const argMatch = matchPattern(pattern.args[i], value.args[i]);
				if (!argMatch.matched) {
					return { matched: false, bindings };
				}
				for (const [name, boundValue] of argMatch.bindings) {
					bindings.set(name, boundValue);
				}
			}
			return { matched: true, bindings };
		}

		case 'literal': {
			let matches = false;
			if (typeof pattern.value === 'number' && isNumber(value)) {
				matches = pattern.value === value.value;
			} else if (typeof pattern.value === 'string' && isString(value)) {
				matches = pattern.value === value.value;
			}
			return { matched: matches, bindings };
		}

		case 'tuple': {
			if (value.tag !== 'tuple') {
				return { matched: false, bindings };
			}
			if (pattern.elements.length !== value.values.length) {
				return { matched: false, bindings };
			}

			for (let i = 0; i < pattern.elements.length; i++) {
				const elementMatch = matchPattern(pattern.elements[i], value.values[i]);
				if (!elementMatch.matched) {
					return { matched: false, bindings };
				}
				for (const [name, boundValue] of elementMatch.bindings) {
					bindings.set(name, boundValue);
				}
			}
			return { matched: true, bindings };
		}

		case 'record': {
			if (value.tag !== 'record') {
				return { matched: false, bindings };
			}

			for (const field of pattern.fields) {
				const fieldValue = value.fields[field.fieldName];
				if (fieldValue === undefined) {
					return { matched: false, bindings };
				}
				const fieldMatch = matchPattern(field.pattern, fieldValue);
				if (!fieldMatch.matched) {
					return { matched: false, bindings };
				}
				for (const [name, boundValue] of fieldMatch.bindings) {
					bindings.set(name, boundValue);
				}
			}
			return { matched: true, bindings };
		}

		default:
			throw new Error(`Unsupported pattern kind: ${(pattern as Pattern).kind}`);
	}
};
