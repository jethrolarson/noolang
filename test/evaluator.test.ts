import { Parser } from '../src/parser';
import { Evaluator } from '../src/evaluator';

describe('Evaluator', () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  test('should evaluate number literals', () => {
    const parser = new Parser('42');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(42);
  });

  test('should evaluate string literals', () => {
    const parser = new Parser('"hello"');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe('hello');
  });

  test('should evaluate boolean literals', () => {
    const parser = new Parser('true');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(true);
  });

  test('should evaluate arithmetic operations', () => {
    const parser = new Parser('2 + 3');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(5);
  });

  test('should evaluate function definitions and applications', () => {
    const parser = new Parser('add = fn x y => x + y; add 2 3');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(5);
  });

  test('should evaluate if expressions', () => {
    const parser = new Parser('if true then 1 else 2');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(1);
  });

  test('should evaluate if expressions with false condition', () => {
    const parser = new Parser('if false then 1 else 2');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(2);
  });

  test('should evaluate list operations', () => {
    const parser = new Parser('[1 2 3] |> head');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(1);
  });

  test('should evaluate comparison operations', () => {
    const parser = new Parser('2 < 3');
    const program = parser.parse();
    const results = evaluator.evaluateProgram(program);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(true);
  });

  test('should handle undefined variables', () => {
    const parser = new Parser('undefined_var');
    const program = parser.parse();
    
    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow('Undefined variable: undefined_var');
  });

  test('should handle type errors in arithmetic', () => {
    const parser = new Parser('"hello" + 5');
    const program = parser.parse();
    
    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow('Cannot add string and number');
  });
}); 