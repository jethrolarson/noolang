import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { parse } from '../../src/parser/parser';
import { Lexer } from '../../src/lexer/lexer';

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

describe('Closure behavior', () => {
	function evalNoo(src: string) {
		const lexer = new Lexer(src);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator();
		return evaluator.evaluateProgram(program).finalResult;
	}

	test('simple closure: makeAdder', () => {
		const src = `
      makeAdder = fn x => fn y => x + y;
      add5 = makeAdder 5;
      result = add5 10;
      result
    `;
		expect(unwrapValue(evalNoo(src))).toBe(15);
	});

	test('closure in a record', () => {
		const code = `
      makeCounter = fn start => { @value start };
      counter = makeCounter 10;
      result = (@value counter);
      result
    `;
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator();
		const result = evaluator.evaluateProgram(program);

		expect(unwrapValue(result.finalResult)).toBe(10);
	});

	test('closure with function in record', () => {
		const code = `
      makeCounter = fn start => { @value start };
      counter1 = makeCounter 10;
      counter2 = makeCounter 20;
      result1 = (@value counter1);
      result2 = (@value counter2);
      result1 + result2
    `;
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator();
		const result = evaluator.evaluateProgram(program);

		expect(unwrapValue(result.finalResult)).toBe(30);
	});
});
