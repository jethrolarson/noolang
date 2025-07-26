import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { Evaluator, Value } from '../../src/evaluator/evaluator';

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
const runCode = (code: string) => {
	const evaluator = new Evaluator();
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	return evaluator.evaluateProgram(decoratedResult.program);
};

test('should handle simple Option construction', () => {
	const code = `Some 42`;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	assert.is(unwrapped.name, 'Some');
	assert.equal(unwrapped.args, [42]);
});

test('should handle None construction', () => {
	const code = `None`;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	assert.is(unwrapped.name, 'None');
	assert.equal(unwrapped.args, []);
});

test('should handle Option in conditional expressions', () => {
	// FIXME: Currently fails with "Cannot unify Option a with Option a"
	const code = `
      result = if True then Some 42 else None;
      result
    `;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	assert.is(unwrapped.name, 'Some');
	assert.equal(unwrapped.args, [42]);
});

test('should handle Option function return types', () => {
	const code = `
      makeOption = fn x => if x > 0 then Some x else None;
      makeOption 5
    `;
	const result = runCode(code);
	const unwrapped = unwrapValue(result.finalResult);
	assert.is(unwrapped.name, 'Some');
	assert.equal(unwrapped.args, [5]);
});

test.run();
