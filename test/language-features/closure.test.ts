import { test, expect } from 'bun:test';
import { runCode } from '../utils';

test('simple closure: makeAdder', () => {
	const src = `
      makeAdder = fn x => fn y => x + y;
      add5 = makeAdder 5;
      result = add5 10;
      result
    `;
	expect(runCode(src).finalValue).toBe(15);
});

test('closure in a record', () => {
	const code = `
      makeCounter = fn start => { @value start };
      counter = makeCounter 10;
      result = (@value counter);
      result
    `;

	expect(runCode(code).finalValue).toBe(10);
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

	expect(runCode(code).finalValue).toBe(30);
});
