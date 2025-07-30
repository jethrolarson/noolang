import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { describe, test, expect } from 'bun:test';

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
			return { name: val.name, args: val.args.map(unwrapValue) };
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

// Test suite: Option Type Unification Tests
let evaluator: Evaluator;

// Setup function (was beforeEach)
const setup = () => {
	evaluator = new Evaluator();
};

const runCode = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	return evaluator.evaluateProgram(decoratedResult.program);
};

test('should handle simple Option construction', () => {
	setup();
	const code = `Some 42`;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	expect(unwrapped.name).toBe('Some');
	expect(unwrapped.args).toEqual([42]);
});

test('should handle None construction', () => {
	setup();
	const code = `None`;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	expect(unwrapped.name).toBe('None');
	expect(unwrapped.args).toEqual([]);
});

test('should handle Option in conditional expressions', () => {
	setup();
	// FIXME: Currently fails with "Cannot unify Option a with Option a"
	const code = `
      result = if True then Some 42 else None;
      result
    `;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	expect(unwrapped.name).toBe('Some');
	expect(unwrapped.args).toEqual([42]);
});

test('should handle Option function return types', () => {
	setup();
	const code = `
      makeOption = fn x => if x > 0 then Some x else None;
      makeOption 5
    `;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	expect(unwrapped.name).toBe('Some');
	expect(unwrapped.args).toEqual([5]);
});

