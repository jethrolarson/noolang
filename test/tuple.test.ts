import { Evaluator, Value } from '../src/evaluator';
import { parse } from '../src/parser/parser';
import { Lexer } from '../src/lexer';

function unwrapValue(val: Value): any {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
			if (val.name === 'True') return true;
			if (val.name === 'False') return false;
			return val;
		case 'list':
			return val.values.map(unwrapValue);
		case 'tuple':
			return val.values.map(unwrapValue);
		case 'record': {
			const obj: any = {};
			for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
			return obj;
		}
		default:
			return val;
	}
}

describe('Tuple Native Functions', () => {
	const evaluateSource = (source: string) => {
		const evaluator = new Evaluator();
		const lexer = new Lexer(source);
		return evaluator.evaluateProgram(parse(lexer.tokenize()));
	};

	describe('tupleLength', () => {
		test('length of empty tuple', () => {
			const source = 'tuple = {}; tupleLength tuple';
			// { } is now unit, not an empty tuple, so this should throw an error
			expect(() => evaluateSource(source)).toThrow(
				'tupleLength requires a tuple'
			);
		});
		test('length of singleton tuple', () => {
			const source = 'tuple = { 1 }; tupleLength tuple';
			const result = evaluateSource(source);
			expect(unwrapValue(result.finalResult)).toBe(1);
		});
		test('length of pair tuple', () => {
			const source = 'tuple = { 1, 2 }; tupleLength tuple';
			const result = evaluateSource(source);
			expect(unwrapValue(result.finalResult)).toBe(2);
		});
	});

	describe('tupleIsEmpty', () => {
		test('returns true for empty tuple', () => {
			const source = 'tuple = {}; tupleIsEmpty tuple';
			// { } is now unit, not an empty tuple, so this should throw an error
			expect(() => evaluateSource(source)).toThrow(
				'tupleIsEmpty requires a tuple'
			);
		});
		test('returns false for non-empty tuple', () => {
			const source = 'tuple = { 1, 2, 3 }; tupleIsEmpty tuple';
			const result = evaluateSource(source);
			expect(unwrapValue(result.finalResult)).toBe(false);
		});
	});
});
