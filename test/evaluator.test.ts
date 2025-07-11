import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Evaluator } from '../src/evaluator';

describe('Evaluator', () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  test('should evaluate number literals', () => {
    const lexer = new Lexer('42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(42);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate string literals', () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe('hello');
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate boolean literals', () => {
    const lexer = new Lexer('true');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(true);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate arithmetic operations', () => {
    const lexer = new Lexer('2 + 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate function definitions and applications', () => {
    const lexer = new Lexer('fn x => x + 1; (fn x => x + 1) 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(3); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate list operations', () => {
    const lexer = new Lexer('[1; 2; 3] |> head');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate map function', () => {
    const lexer = new Lexer('map (fn x => x * 2) [1; 2; 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toEqual([2, 4, 6]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate filter function', () => {
    const lexer = new Lexer('filter (fn x => x > 2) [1; 2; 3; 4; 5]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toEqual([3, 4, 5]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate length function', () => {
    const lexer = new Lexer('length [1; 2; 3; 4; 5]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate isEmpty function', () => {
    const lexer = new Lexer('isEmpty []; isEmpty [1; 2; 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(false); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate append function', () => {
    const lexer = new Lexer('append [1; 2] [3; 4]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toEqual([1, 2, 3, 4]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate math utility functions', () => {
    const lexer = new Lexer('abs 5; max 3 7; min 3 7');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    // Only the final expression result is returned: min 3 7 = 3
    expect(result.finalResult).toBe(3);
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate string utility functions', () => {
    const lexer = new Lexer('concat "hello" " world"; toString 42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe('42'); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate if expressions', () => {
    const lexer = new Lexer('if true then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate if expressions with false condition', () => {
    const lexer = new Lexer('if false then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(2);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate comparison operations', () => {
    const lexer = new Lexer('2 < 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(result.finalResult).toBe(true);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should handle undefined variables', () => {
    const lexer = new Lexer('undefined_var');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow('Undefined variable: undefined_var');
  });

  test('should handle type errors in arithmetic', () => {
    const lexer = new Lexer('"hello" + 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow('Cannot add string and number');
  });

  test('should evaluate top-level definitions and use them', () => {
    const lexer = new Lexer('add = fn x y => x + y; add 2 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toBe(5);
  });

  test('should evaluate basic import', () => {
    const lexer = new Lexer('import "examples/test_import"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toBe(42);
  });

  test('should evaluate single-field record', () => {
    const lexer = new Lexer('{ @name "Alice" }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toEqual({ name: 'Alice' });
  });

  test('should evaluate multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice"; @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toEqual({ name: 'Alice', age: 30 });
  });

  test('should evaluate multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice"; @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toEqual({ name: 'Alice', age: 30 });
  });

  test('should evaluate accessor on record', () => {
    const lexer = new Lexer('user = { @name "Alice"; @age 30 }; (@name user)');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toBe('Alice');
  });

  test('definition with sequence on right side using parentheses', () => {
    const lexer = new Lexer('foo = (1; 2); foo');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toBe(2);
  });

  test('multiple definitions sequenced', () => {
    const lexer = new Lexer('foo = 1; 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toBe(2);
    // foo should be defined as 1 in the environment
    // (not directly testable here, but no error should occur)
  });
}); 

describe('Semicolon sequencing', () => {
  function evalNoo(src: string) {
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    return evaluator.evaluateProgram(program).finalResult;
  }

  test('returns only the rightmost value', () => {
    expect(evalNoo('1; 2; 3')).toBe(3);
    expect(evalNoo('42; "hello"')).toBe("hello");
  });

  test('if-expression in sequence', () => {
    expect(evalNoo('1; if 2 < 3 then 4 else 5')).toBe(4);
    expect(evalNoo('1; if 2 > 3 then 4 else 5')).toBe(5);
    expect(evalNoo('1; if 2 < 3 then 4 else 5; 99')).toBe(99);
    expect(evalNoo('if 2 < 3 then 4 else 5; 42')).toBe(42);
  });

  test('definitions in sequence', () => {
    expect(evalNoo('x = 10; x + 5')).toBe(15);
    expect(evalNoo('a = 1; b = 2; a + b')).toBe(3);
  });

  test('complex sequencing', () => {
    expect(evalNoo('x = 1; if x == 1 then 100 else 200; x + 1')).toBe(2);
    expect(evalNoo('x = 1; y = 2; if x < y then x else y; x + y')).toBe(3);
  });
}); 