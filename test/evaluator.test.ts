import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Evaluator } from '../src/evaluator';
import { Value } from '../src/evaluator';

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== 'object') return val;
  switch (val.tag) {
    case 'number': return val.value;
    case 'string': return val.value;
    case 'boolean': return val.value;
    case 'list': return val.values.map(unwrapValue);
    case 'tuple': return val.values.map(unwrapValue);
    case 'record': {
      const obj: any = {};
      for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
      return obj;
    }
    default: return val;
  }
}

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
    
    expect(unwrapValue(result.finalResult)).toBe(42);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate string literals', () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe('hello');
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate boolean literals', () => {
    const lexer = new Lexer('true');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(true);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate arithmetic operations', () => {
    const lexer = new Lexer('2 + 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate function definitions and applications', () => {
    const lexer = new Lexer('fn x => x + 1; (fn x => x + 1) 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(3); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate list operations', () => {
    const lexer = new Lexer('[1, 2, 3] |> head');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate map function', () => {
    const lexer = new Lexer('map (fn x => x * 2) [1, 2, 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toEqual([2, 4, 6]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate filter function', () => {
    const lexer = new Lexer('filter (fn x => x > 2) [1, 2, 3, 4, 5]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual([3, 4, 5]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate length function', () => {
    const lexer = new Lexer('length [1, 2, 3, 4, 5]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate isEmpty function', () => {
    const lexer = new Lexer('isEmpty []; isEmpty [1, 2, 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(false); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate append function', () => {
    const lexer = new Lexer('append [1, 2] [3, 4]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toEqual([1, 2, 3, 4]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate math utility functions', () => {
    const lexer = new Lexer('abs 5; max 3 7; min 3 7');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    // Only the final expression result is returned: min 3 7 = 3
    expect(unwrapValue(result.finalResult)).toBe(3);
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate string utility functions', () => {
    const lexer = new Lexer('concat "hello" " world"; toString 42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe('42'); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test('should evaluate if expressions', () => {
    const lexer = new Lexer('if true then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate if expressions with false condition', () => {
    const lexer = new Lexer('if false then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(2);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate comparison operations', () => {
    const lexer = new Lexer('2 < 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    
    expect(unwrapValue(result.finalResult)).toBe(true);
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
    expect(unwrapValue(result.finalResult)).toBe(5);
  });

  test('should evaluate basic import', () => {
    const lexer = new Lexer('import "examples/test_import"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(42);
  });

  test('should evaluate single-field record', () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
  });

  test('should evaluate multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
  });

  test('should evaluate multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: 'Alice', age: 30 });
  });

  test('should evaluate accessor on record', () => {
    const lexer = new Lexer('user = { @name "Alice", @age 30 }; (@name user)');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe('Alice');
  });

  test('definition with sequence on right side using parentheses', () => {
    const lexer = new Lexer('foo = (1; 2); foo');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(2);
  });

  test('multiple definitions sequenced', () => {
    const lexer = new Lexer('foo = 1; 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(2);
    // foo should be defined as 1 in the environment
    // (not directly testable here, but no error should occur)
  });

  test('should evaluate function with unit parameter', () => {
    const lexer = new Lexer('foo = fn {} => "joe"; foo {}');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe('joe');
  });

  describe('Top-level sequence evaluation', () => {
    test('multiple definitions and final expression', () => {
      const lexer = new Lexer('a = 1; b = 2; a + b');
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      expect(unwrapValue(result.finalResult)).toBe(3);
    });

    test('multiple definitions and final record', () => {
      const code = `
        add = fn x y => x + y;
        sub = fn x y => x - y;
        math = { @add add, @sub sub };
        math
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      // Test that the record contains the expected fields
      expect(unwrapValue(result.finalResult)).toHaveProperty('add');
      expect(unwrapValue(result.finalResult)).toHaveProperty('sub');
      // Test that the fields are functions (Noolang functions are now tagged objects)
      const mathRecord = unwrapValue(result.finalResult) as any;
      expect(mathRecord.add).toHaveProperty('tag', 'function');
      expect(mathRecord.sub).toHaveProperty('tag', 'function');
    });

    test('sequence with trailing semicolon', () => {
      const lexer = new Lexer('a = 1; b = 2; a + b;');
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      expect(unwrapValue(result.finalResult)).toBe(3);
    });
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
    expect(unwrapValue(evalNoo('1; 2; 3'))).toBe(3);
    expect(unwrapValue(evalNoo('42; "hello"'))).toBe("hello");
  });

  test('if-expression in sequence', () => {
    expect(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5'))).toBe(4);
    expect(unwrapValue(evalNoo('1; if 2 > 3 then 4 else 5'))).toBe(5);
    expect(unwrapValue(evalNoo('1; if 2 < 3 then 4 else 5; 99'))).toBe(99);
    expect(unwrapValue(evalNoo('if 2 < 3 then 4 else 5; 42'))).toBe(42);
  });

  test('definitions in sequence', () => {
    expect(unwrapValue(evalNoo('x = 10; x + 5'))).toBe(15);
    expect(unwrapValue(evalNoo('a = 1; b = 2; a + b'))).toBe(3);
  });

  test('complex sequencing', () => {
    expect(unwrapValue(evalNoo('x = 1; if x == 1 then 100 else 200; x + 1'))).toBe(2);
    expect(unwrapValue(evalNoo('x = 1; y = 2; if x < y then x else y; x + y'))).toBe(3);
  });
}); 

describe('If associativity and nesting', () => {
  function evalIfChain(x: number) {
    const src = `if ${x} == 0 then 0 else if ${x} == 1 then 1 else if ${x} == 2 then 2 else 99`;
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    return evaluator.evaluateProgram(program).finalResult;
  }

  test('returns 0 for x == 0', () => {
    expect(unwrapValue(evalIfChain(0))).toBe(0);
  });
  test('returns 1 for x == 1', () => {
    expect(unwrapValue(evalIfChain(1))).toBe(1);
  });
  test('returns 2 for x == 2', () => {
    expect(unwrapValue(evalIfChain(2))).toBe(2);
  });
  test('returns 99 for x == 3', () => {
    expect(unwrapValue(evalIfChain(3))).toBe(99);
  });
}); 

 