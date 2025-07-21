import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { typeAndDecorate } from "../src/typer";
import { Evaluator } from "../src/evaluator";
import { Value } from "../src/evaluator";

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== "object") return val;
  switch (val.tag) {
    case "number":
      return val.value;
    case "string":
      return val.value;
    case "constructor":
      if (val.name === "True") return true;
      if (val.name === "False") return false;
      return val;
    case "list":
      return val.values.map(unwrapValue);
    case "tuple":
      return val.values.map(unwrapValue);
    case "record": {
      const obj: any = {};
      for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
      return obj;
    }
    default:
      return val;
  }
}

describe("Evaluator", () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  const runCode = (code: string) => {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    return evaluator.evaluateProgram(decoratedResult.program);
  };

  test("should set a field in a record using set", () => {
    const lexer = new Lexer(
      'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user2',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 31 });
  });

  test("should add a new field to a record using set", () => {
    const lexer = new Lexer(
      'user = { @name "Alice" }; user2 = set @age user 42; user2',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 42 });
  });

  test("set should not mutate the original record", () => {
    const lexer = new Lexer(
      'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user;',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 30 });
  });

  test("should evaluate number literals", () => {
    const lexer = new Lexer("42");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(42);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate string literals", () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe("hello");
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate boolean literals", () => {
    const result = runCode("True");
    expect(unwrapValue(result.finalResult)).toBe(true);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate arithmetic operations", () => {
    const lexer = new Lexer("2 + 3");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate function definitions and applications", () => {
    const lexer = new Lexer("fn x => x + 1; (fn x => x + 1) 2");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(3); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test("should evaluate list operations", () => {
    const lexer = new Lexer("[1, 2, 3] | head");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    // head now returns Some 1 instead of 1
    const finalResult = unwrapValue(result.finalResult);
    expect(finalResult.name).toBe("Some");
    expect(unwrapValue(finalResult.args[0])).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate map function", () => {
    const lexer = new Lexer("map (fn x => x * 2) [1, 2, 3]");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toEqual([2, 4, 6]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate filter function", () => {
    const lexer = new Lexer("filter (fn x => x > 2) [1, 2, 3, 4, 5]");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual([3, 4, 5]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test('should evaluate reduce function', () => {
		const lexer = new Lexer('reduce (fn acc x => acc + x) 0 [1, 2, 3, 4, 5]');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const result = evaluator.evaluateProgram(program);
		expect(unwrapValue(result.finalResult)).toBe(15); // 0 + 1 + 2 + 3 + 4 + 5 = 15
		expect(result.executionTrace).toHaveLength(1);
	});

  test("should evaluate length function", () => {
    const lexer = new Lexer("length [1, 2, 3, 4, 5]");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(5);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate isEmpty function", () => {
    const lexer = new Lexer("isEmpty []; isEmpty [1, 2, 3]");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(false); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test("should evaluate append function", () => {
    const lexer = new Lexer("append [1, 2] [3, 4]");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toEqual([1, 2, 3, 4]);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate math utility functions", () => {
    const lexer = new Lexer("abs 5; max 3 7; min 3 7");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    // Only the final expression result is returned: min 3 7 = 3
    expect(unwrapValue(result.finalResult)).toBe(3);
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test("should evaluate string utility functions", () => {
    const lexer = new Lexer('concat "hello" " world"; toString 42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe("42"); // Only the final expression result is returned
    expect(result.executionTrace).toHaveLength(1); // Single statement with semicolon operator
  });

  test("should evaluate if expressions", () => {
    const result = runCode("if True then 1 else 2");
    expect(unwrapValue(result.finalResult)).toBe(1);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate if expressions with false condition", () => {
    const result = runCode("if False then 1 else 2");
    expect(unwrapValue(result.finalResult)).toBe(2);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should evaluate comparison operations", () => {
    const lexer = new Lexer("2 < 3");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);

    expect(unwrapValue(result.finalResult)).toBe(true);
    expect(result.executionTrace).toHaveLength(1);
  });

  test("should handle undefined variables", () => {
    const lexer = new Lexer("undefined_var");
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow("Undefined variable: undefined_var");
  });

  test("should handle type errors in arithmetic", () => {
    const lexer = new Lexer('"hello" + 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      evaluator.evaluateProgram(program);
    }).toThrow("Cannot add string and number");
  });

  // Recursion Tests
  describe("Recursion", () => {
    test("should handle factorial recursion", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 5
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(120); // 5! = 120
    });

    test("should handle factorial with 0", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 0
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(1); // 0! = 1
    });

    test("should handle factorial with 1", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 1
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(1); // 1! = 1
    });

    test("should handle fibonacci recursion", () => {
      const code = `
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 10
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(55); // fib(10) = 55
    });

    test("should handle fibonacci with small values", () => {
      const code = `
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 0; fibonacci 1; fibonacci 2; fibonacci 3
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(2); // fib(3) = 2
    });

    test("should handle recursive list length", () => {
      const code = `
        recLength = fn list => if isEmpty list then 0 else 1 + (recLength (tail list));
        recLength [1, 2, 3, 4, 5]
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(5);
    });

    test("should handle recursive list sum", () => {
      const code = `
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recSum = fn list => if isEmpty list then 0 else (getSome (head list)) + (recSum (tail list));
        recSum [1, 2, 3, 4, 5]
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(15); // 1 + 2 + 3 + 4 + 5 = 15
    });

    test("should handle recursive list reverse", () => {
      const code = `
        # Helper to extract value from Some
        getSome = fn opt => match opt with (Some x => x; None => 0);
        recReverse = fn list => if isEmpty list then [] else append (recReverse (tail list)) [getSome (head list)];
        recReverse [1, 2, 3]
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toEqual([3, 2, 1]);
    });

    test("should handle recursive power function", () => {
      const code = `
        power = fn base exp => if exp == 0 then 1 else base * (power base (exp - 1));
        power 2 8
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(256); // 2^8 = 256
    });

    test("should handle recursive gcd function", () => {
      const code = `
        gcd = fn a b => 
          if a == b then a 
          else if a > b then gcd (a - b) b 
          else gcd a (b - a);
        gcd 48 18
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(6); // gcd(48, 18) = 6
    });

    test.skip("should handle deep recursion without stack overflow", () => {
      // TODO: This test currently fails due to excessive JavaScript stack frame usage.
      // Each Noolang recursive call creates ~6 JavaScript stack frames:
      // evaluateApplication + withNewEnvironment + arrow function + evaluateExpression + evaluateIf + recursive call
      // So 1000 Noolang calls = ~6000 JS frames, exceeding typical stack limits (~10k frames).
      // The evaluator needs optimization to reduce stack frame usage per call.
      const code = `
        countDown = fn n => if n == 0 then 0 else countDown (n - 1);
        countDown 1000
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(0);
    });

    test("should handle recursive function with multiple parameters", () => {
      const code = `
        multiply = fn a b => if b == 0 then 0 else a + (multiply a (b - 1));
        multiply 3 4
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(12); // 3 * 4 = 12
    });

    test("should handle recursive function in sequence", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        a = factorial 3;
        b = factorial 4;
        a + b
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);

      expect(unwrapValue(result.finalResult)).toBe(30); // 3! + 4! = 6 + 24 = 30
    });
  });

  test("should evaluate top-level definitions and use them", () => {
    const lexer = new Lexer("add = fn x y => x + y; add 2 3");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(5);
  });

  test("should evaluate basic import", () => {
    const lexer = new Lexer('import "test/test_import"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(42);
  });

  test("should evaluate single-field record", () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 30 });
  });

  test("should evaluate multi-field record (semicolon separated)", () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 30 });
  });

  test("should evaluate accessor on record", () => {
    const lexer = new Lexer('user = { @name "Alice", @age 30 }; (@name user)');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe("Alice");
  });

  test("definition with sequence on right side using parentheses", () => {
    const lexer = new Lexer("foo = (1; 2); foo");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(2);
  });

  test("multiple definitions sequenced", () => {
    const lexer = new Lexer("foo = 1; 2");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(2);
    // foo should be defined as 1 in the environment
    // (not directly testable here, but no error should occur)
  });

  test("should evaluate function with unit parameter", () => {
    const lexer = new Lexer('foo = fn {} => "joe"; foo {}');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe("joe");
  });

  test("should evaluate thrush operator", () => {
    const lexer = new Lexer("10 | (fn x => x + 1)");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toBe(11);
  });

  test("should evaluate chained thrush operators", () => {
    const lexer = new Lexer(
      "[1, 2, 3] | map (fn x => x + 1) | map (fn x => x * x)",
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual([4, 9, 16]);
  });

  describe("Top-level sequence evaluation", () => {
    test("multiple definitions and final expression", () => {
      const lexer = new Lexer("a = 1; b = 2; a + b");
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      expect(unwrapValue(result.finalResult)).toBe(3);
    });

    test("multiple definitions and final record", () => {
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
      expect(unwrapValue(result.finalResult)).toHaveProperty("add");
      expect(unwrapValue(result.finalResult)).toHaveProperty("sub");
      // Test that the fields are functions (Noolang functions are now tagged objects)
      const mathRecord = unwrapValue(result.finalResult) as any;
      expect(mathRecord.add).toHaveProperty("tag", "function");
      expect(mathRecord.sub).toHaveProperty("tag", "function");
    });

    test("sequence with trailing semicolon", () => {
      const lexer = new Lexer("a = 1; b = 2; a + b;");
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      expect(unwrapValue(result.finalResult)).toBe(3);
    });
  });

  test("duck-typed record accessor chain", () => {
    const code = `
      foo = {@bar {@baz fn x => {@qux x}, @extra 42}};
      (((foo | @bar) | @baz) $ 1) | @qux
    `;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult).toEqual({ tag: "number", value: 1 });
  });

  test("should set a field in a record using set", () => {
    const lexer = new Lexer(
      'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user2',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 31 });
  });

  test("should add a new field to a record using set", () => {
    const lexer = new Lexer(
      'user = { @name "Alice" }; user2 = set @age user 42; user2',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 42 });
  });

  test("set should not mutate the original record", () => {
    const lexer = new Lexer(
      'user = { @name "Alice", @age 30 }; user2 = set @age user 31; user;',
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const result = evaluator.evaluateProgram(program);
    expect(unwrapValue(result.finalResult)).toEqual({ name: "Alice", age: 30 });
  });
});

describe("Semicolon sequencing", () => {
  function evalNoo(src: string) {
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    return evaluator.evaluateProgram(program).finalResult;
  }

  test("returns only the rightmost value", () => {
    expect(unwrapValue(evalNoo("1; 2; 3"))).toBe(3);
    expect(unwrapValue(evalNoo('42; "hello"'))).toBe("hello");
  });

  test("if-expression in sequence", () => {
    expect(unwrapValue(evalNoo("1; if 2 < 3 then 4 else 5"))).toBe(4);
    expect(unwrapValue(evalNoo("1; if 2 > 3 then 4 else 5"))).toBe(5);
    expect(unwrapValue(evalNoo("1; if 2 < 3 then 4 else 5; 99"))).toBe(99);
    expect(unwrapValue(evalNoo("if 2 < 3 then 4 else 5; 42"))).toBe(42);
  });

  test("definitions in sequence", () => {
    expect(unwrapValue(evalNoo("x = 10; x + 5"))).toBe(15);
    expect(unwrapValue(evalNoo("a = 1; b = 2; a + b"))).toBe(3);
  });

  test("complex sequencing", () => {
    expect(
      unwrapValue(evalNoo("x = 1; if x == 1 then 100 else 200; x + 1")),
    ).toBe(2);
    expect(
      unwrapValue(evalNoo("x = 1; y = 2; if x < y then x else y; x + y")),
    ).toBe(3);
  });
});

describe("If associativity and nesting", () => {
  function evalIfChain(x: number) {
    const src = `if ${x} == 0 then 0 else if ${x} == 1 then 1 else if ${x} == 2 then 2 else 99`;
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    return evaluator.evaluateProgram(program).finalResult;
  }

  test("returns 0 for x == 0", () => {
    expect(unwrapValue(evalIfChain(0))).toBe(0);
  });
  test("returns 1 for x == 1", () => {
    expect(unwrapValue(evalIfChain(1))).toBe(1);
  });
  test("returns 2 for x == 2", () => {
    expect(unwrapValue(evalIfChain(2))).toBe(2);
  });
  test("returns 99 for x == 3", () => {
    expect(unwrapValue(evalIfChain(3))).toBe(99);
  });
});

describe("Local Mutation (mut/mut!)", () => {
  it("should allow defining and mutating a local variable", () => {
    const code = `mut x = 1; mut! x = 42; x`;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult.tag).toBe("number");
    if (result.finalResult.tag === "number") {
      expect(result.finalResult.value).toBe(42);
    }
  });

  it("should not affect other variables or outer scope", () => {
    const code = `x = 5; mut y = 10; mut! y = 99; x + y`;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult.tag).toBe("number");
    if (result.finalResult.tag === "number") {
      expect(result.finalResult.value).toBe(5 + 99);
    }
  });

  it("should throw if mut! is used on non-mutable variable", () => {
    const code = `x = 1; mut! x = 2`;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    expect(() => evaluator.evaluateProgram(program)).toThrow(
      /Cannot mutate non-mutable variable/,
    );
  });

  it("should allow returning a mutable variable value (pass-by-value)", () => {
    const code = `mut x = 7; mut! x = 8; x`;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    expect(result.finalResult.tag).toBe("number");
    if (result.finalResult.tag === "number") {
      expect(result.finalResult.value).toBe(8);
    }
  });
});

// Additional Coverage Tests - targeting specific uncovered lines
describe("Additional Coverage Tests", () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  const runCode = (code: string) => {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    return evaluator.evaluateProgram(decoratedResult.program);
  };

  describe("Pattern Matching Coverage", () => {
    test("should handle wildcard patterns and variable binding", () => {
      const code = `
        type Option a = Some a | None;
        getValue = fn opt => match opt with (
          Some x => x + 10;
          None => 0;
          _ => -1
        );
        getValue (Some 5)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(15);
    });

    test("should handle constructor pattern matching with multiple patterns", () => {
      const code = `
        type Choice = First Int | Second String | Third;
        process = fn choice => match choice with (
          First n => n * 2;
          Second s => 100;
          Third => 200
        );
        process (First 21)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(42);
    });
  });

  describe("ValueToString Function Coverage (Lines 1757-1783)", () => {
    test("should convert different value types to string via toString", () => {
      // Testing various branches of valueToString function
      expect(unwrapValue(runCode("toString 42").finalResult)).toBe("42");
      expect(unwrapValue(runCode('toString "hello"').finalResult)).toBe('"hello"');
      expect(unwrapValue(runCode("toString True").finalResult)).toBe("True");
      expect(unwrapValue(runCode("toString False").finalResult)).toBe("False");
      expect(unwrapValue(runCode("toString []").finalResult)).toBe("[]");
      expect(unwrapValue(runCode("toString [1, 2, 3]").finalResult)).toBe("[1; 2; 3]");
      expect(unwrapValue(runCode("toString {1, 2}").finalResult)).toBe("{1; 2}");
      expect(unwrapValue(runCode('toString { @x 10, @y 20 }').finalResult)).toBe("{@x 10; @y 20}");
      expect(unwrapValue(runCode("toString (fn x => x)").finalResult)).toBe("<function>");
      expect(unwrapValue(runCode("toString {}").finalResult)).toBe("unit");
    });

    test("should handle constructor values in toString", () => {
      const code1 = `
        type Color = Red | Green | Blue;
        toString Red
      `;
      expect(unwrapValue(runCode(code1).finalResult)).toBe("Red");

      const code2 = `
        type Option a = Some a | None;
        toString (Some 42)
      `;
      expect(unwrapValue(runCode(code2).finalResult)).toBe("Some 42");

      const code3 = `
        type Point = Point Int Int;
        toString (Point 10 20)
      `;
      expect(unwrapValue(runCode(code3).finalResult)).toBe("Point 10 20");
    });

    test("should handle complex nested data structures in toString", () => {
      const code = `
        type Option a = Some a | None;
        data = [Some 1, Some 2, None];
        toString data
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("[Some 1; Some 2; None]");
    });
  });

  describe("Error Path Coverage", () => {
    test("should handle invalid pattern kinds via tryMatchPattern", () => {
      // This directly tests the uncovered error path
      const invalidPattern = { kind: "invalid" } as any;
      const value = { tag: "number", value: 42 } as any;
      
      expect(() => {
        evaluator['tryMatchPattern'](invalidPattern, value);
      }).toThrow("Unsupported pattern kind: invalid");
    });
  });

  describe("Edge Cases for Better Coverage", () => {
    test("should handle empty list and empty tuple toString", () => {
      expect(unwrapValue(runCode("toString []").finalResult)).toBe("[]");
      expect(unwrapValue(runCode("toString {}").finalResult)).toBe("unit");
    });

    test("should handle complex record with multiple fields", () => {
      const code = `toString { @name "Alice", @age 30, @city "NYC" }`;
      const result = unwrapValue(runCode(code).finalResult);
      expect(result).toContain("@name");
      expect(result).toContain("@age");  
      expect(result).toContain("@city");
    });

    test("should handle nested tuples", () => {
      const result = unwrapValue(runCode("toString {{1, 2}, {3, 4}}").finalResult);
      expect(result).toBe("{{1; 2}; {3; 4}}");
    });
  });
});
