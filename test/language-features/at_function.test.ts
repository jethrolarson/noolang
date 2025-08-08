import { test, expect } from 'bun:test';
import { runCode } from '../utils';

// List cases

test('at works on lists: index 0', () => {
  const code = `at 0 [1, 2, 3]`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({
    tag: 'constructor',
    name: 'Some',
    args: [{ tag: 'number', value: 1 }],
  });
  expect(result.finalType.includes('Option')).toBe(true);
});

test('at works on lists: middle index', () => {
  const code = `at 1 [10, 20, 30]`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({
    tag: 'constructor',
    name: 'Some',
    args: [{ tag: 'number', value: 20 }],
  });
});

test('at returns None for out-of-range list index', () => {
  const code = `at 5 [1, 2, 3]`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
});

// Tuple cases

test('at works on tuples: index 0', () => {
  const code = `at 0 {1, 2, 3}`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({
    tag: 'constructor',
    name: 'Some',
    args: [{ tag: 'number', value: 1 }],
  });
});

test('at works on tuples: middle index', () => {
  const code = `at 1 {10, 20, 30}`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({
    tag: 'constructor',
    name: 'Some',
    args: [{ tag: 'number', value: 20 }],
  });
});

test('at returns None for out-of-range tuple index', () => {
  const code = `at 9 {1, 2, 3}`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
});

test('at returns None for empty tuple', () => {
  const code = `at 0 {}`;
  const result = runCode(code);
  expect(result.finalValue).toEqual({ tag: 'constructor', name: 'None', args: [] });
});