import { test, expect } from 'bun:test';
import { runCode } from '../../../test/utils';

test('Trailing lambda type annotation binds to lambda and evaluates', () => {
  const code = `
add_func = fn x y => x + y : Float -> Float -> Float;
add_func 2 3
`;
  const { finalValue, finalType } = runCode(code);
  expect(finalValue).toEqual(5);
  expect(finalType).toMatch(/Float/);
});