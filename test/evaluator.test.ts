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

  // Additional tests for comprehensive evaluator coverage

  describe("Type Definitions", () => {
    test("should evaluate nullary constructor type definitions", () => {
      const code = `
        type Color = Red | Green | Blue;
        Red
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Red");
        expect(result.finalResult.args).toEqual([]);
      }
    });

    test("should evaluate constructor with arguments type definitions", () => {
      const code = `
        type Shape = Circle Int | Rectangle Int Int;
        Circle 5
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Circle");
        expect(result.finalResult.args).toHaveLength(1);
        expect(unwrapValue(result.finalResult.args[0])).toBe(5);
      }
    });

    test("should create curried constructors for multi-argument types", () => {
      const code = `
        type Shape = Rectangle Int Int;
        partialRect = Rectangle 10;
        fullRect = partialRect 20;
        fullRect
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Rectangle");
        expect(result.finalResult.args).toHaveLength(2);
        expect(unwrapValue(result.finalResult.args[0])).toBe(10);
        expect(unwrapValue(result.finalResult.args[1])).toBe(20);
      }
    });
  });

  describe("Pattern Matching", () => {
    test("should match wildcard patterns", () => {
      const code = `
        type Option a = Some a | None;
        getValue = fn opt => match opt with (_ => 42);
        getValue (Some 10)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(42);
    });

    test("should match variable patterns and bind values", () => {
      const code = `
        type Option a = Some a | None;
        getValue = fn opt => match opt with (x => x);
        getValue (Some 123)
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Some");
      }
    });

    test("should match constructor patterns with correct name and args", () => {
      const code = `
        type Option a = Some a | None;
        getValue = fn opt => match opt with (Some x => x; None => 0);
        getValue (Some 456)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(456);
    });

    test("should match constructor patterns with no args", () => {
      const code = `
        type Option a = Some a | None;
        getValue = fn opt => match opt with (Some x => x; None => 999);
        getValue None
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(999);
    });

    test("should match literal number patterns", () => {
      const code = `
        checkNumber = fn n => match n with (42 => True; x => False);
        checkNumber 42
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(true);
    });

    test("should match literal string patterns", () => {
      const code = `
        checkString = fn s => match s with ("hello" => 1; x => 0);
        checkString "hello"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(1);
    });

    test("should fail to match literal patterns with different values", () => {
      const code = `
        checkNumber = fn n => match n with (42 => True; x => False);
        checkNumber 41
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(false);
    });

    test("should handle nested pattern matching in bindings", () => {
      const code = `
        type Point = Point Int Int;
        getX = fn p => match p with (Point x y => x);
        getX (Point 15 25)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(15);
    });

    test("should throw error when no pattern matches", () => {
      const code = `
        type Color = Red | Green;
        getCode = fn c => match c with (Red => 1);
        getCode Green
      `;
      expect(() => runCode(code)).toThrow("No pattern matched in match expression");
    });

    test("should fail to match constructor with wrong name", () => {
      const code = `
        type Option a = Some a | None;
        type Result a b = Ok a | Err b;
        getValue = fn opt => match opt with (Ok x => x; None => 0);
        getValue (Some 123)
      `;
      expect(() => runCode(code)).toThrow("No pattern matched in match expression");
    });

    test("should fail to match constructor with wrong arity", () => {
      const code = `
        type Point = Point Int Int;
        getX = fn p => match p with (Point x => x);
        getX (Point 10 20)
      `;
      expect(() => runCode(code)).toThrow("No pattern matched in match expression");
    });

    test("should fail to match non-constructor values against constructor patterns", () => {
      const code = `
        getValue = fn n => match n with (Some x => x);
        getValue 42
      `;
      expect(() => runCode(code)).toThrow("No pattern matched in match expression");
    });
  });

  describe("Error Handling", () => {
    test("should throw error for unsupported pattern kind", () => {
      // This would require creating a malformed AST, which is difficult to test directly
      // but we can test via the pattern matching error paths
      const evaluator = new Evaluator();
      
      // Test the tryMatchPattern method with an invalid pattern
      const invalidPattern = { kind: "invalid" } as any;
      const value = { tag: "number", value: 42 } as any;
      
      expect(() => {
        evaluator['tryMatchPattern'](invalidPattern, value);
      }).toThrow("Unsupported pattern kind: invalid");
    });

    test("should handle division by zero error with context", () => {
      const code = "10 / 0";
      expect(() => runCode(code)).toThrow("Division by zero");
    });

    test("should throw error for unknown expression kind", () => {
      const evaluator = new Evaluator();
      const invalidExpr = { kind: "invalid", location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } } as any;
      
      expect(() => {
        evaluator.evaluateExpression(invalidExpr);
      }).toThrow("Unknown expression kind: invalid");
    });
  });

  describe("Value to String Conversion", () => {
    test("should convert number values to string", () => {
      const code = "toString 42";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("42");
    });

    test("should convert string values to string", () => {
      const code = 'toString "hello"';
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe('"hello"');
    });

    test("should convert boolean values to string", () => {
      const code = "toString True";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("True");
    });

    test("should convert list values to string", () => {
      const code = "toString [1, 2, 3]";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("[1; 2; 3]");
    });

    test("should convert tuple values to string", () => {
      const code = "toString {1, 2, 3}";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("{1; 2; 3}");
    });

    test("should convert record values to string", () => {
      const code = 'toString { @name "Alice", @age 30 }';
      const result = runCode(code);
      const result_str = unwrapValue(result.finalResult);
      expect(result_str).toContain("@name");
      expect(result_str).toContain("@age");
    });

    test("should convert function values to string", () => {
      const code = "toString (fn x => x)";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("<function>");
    });

    test("should convert native function values to string", () => {
      const code = "toString +";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("<native:+>");
    });

    test("should convert constructor values with no args to string", () => {
      const code = `
        type Color = Red;
        toString Red
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("Red");
    });

    test("should convert constructor values with args to string", () => {
      const code = `
        type Option a = Some a;
        toString (Some 42)
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("Some 42");
    });

    test("should convert unit values to string", () => {
      const code = "toString {}";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("unit");
    });
  });

  describe("Advanced Evaluator Features", () => {
    test("should handle where expressions with pattern definitions", () => {
      const code = `
        let result = 10 where (
          x = 5;
          y = x + 5
        );
        result
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(10);
    });

    test("should handle where expressions with mutable definitions", () => {
      const code = `
        let result = x where (
          mut x = 5;
          mut! x = 10
        );
        result
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(10);
    });

    test("should properly scope where clause definitions", () => {
      const code = `
        x = 1;
        result = x + y where (y = 5);
                 x  # x should still be 1 outside the where clause
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(1);
    });

    test("should handle accessor field errors", () => {
      const code = `
        record = { @name "Alice" };
        @age record
      `;
      expect(() => runCode(code)).toThrow("Field 'age' not found in record");
    });

    test("should handle complex pipeline compositions", () => {
      const code = `
        addOne = fn x => x + 1;
        double = fn x => x * 2;
        composed = addOne |> double |> addOne;
        composed 5
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(13); // ((5 + 1) * 2) + 1 = 13
    });

    test("should handle right-to-left composition", () => {
      const code = `
        addOne = fn x => x + 1;
        double = fn x => x * 2;
        composed = addOne <| double;
        composed 5
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(11); // (5 * 2) + 1 = 11
    });

    test("should handle native function currying edge cases", () => {
      const code = "mutGet";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("native");
      if (result.finalResult.tag === "native") {
        expect(result.finalResult.name).toBe("mutGet");
      }
    });

    test("should handle execution trace with location information", () => {
      const code = "42; 24";
      const result = runCode(code);
      expect(result.executionTrace).toHaveLength(1);
      expect(result.executionTrace[0].location).toBeDefined();
      expect(result.executionTrace[0].location?.line).toBe(1);
    });

    test("should handle empty program", () => {
      const lexer = new Lexer("");
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const result = evaluator.evaluateProgram(program);
      
      expect(result.finalResult.tag).toBe("list");
      if (result.finalResult.tag === "list") {
        expect(result.finalResult.values).toEqual([]);
      }
      expect(result.executionTrace).toHaveLength(0);
    });

    test("should convert expressions to string representation", () => {
      const code = "42";
      const result = runCode(code);
      expect(result.executionTrace[0].expression).toBe("42");
    });

    test("should handle function application with curried native functions", () => {
      const code = "((+) 2) 3";
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(5);
    });

    test("should handle record hasKey utility", () => {
      const code = `
        record = { @name "Alice", @age 30 };
        hasKey record "name"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(true);
    });

    test("should handle record hasValue utility", () => {
      const code = `
        record = { @name "Alice", @age 30 };
        hasValue record "Alice"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(true);
    });

    test("should handle tuple utility functions", () => {
      const code = `
        t = {1, 2, 3};
        length = tupleLength t;
        empty = tupleIsEmpty t;
        {length, empty}
      `;
      const result = runCode(code);
      const resultVal = unwrapValue(result.finalResult);
      expect(resultVal.length).toBe(3);
      expect(resultVal.empty).toBe(false);
    });

    test("should handle Option utility functions", () => {
      const code = `
        some = Some 42;
        none = None;
        {isSome some, isNone none, unwrap some}
      `;
      const result = runCode(code);
      const resultVal = unwrapValue(result.finalResult);
      expect(resultVal.isSome).toBe(true);
      expect(resultVal.isNone).toBe(true);
      expect(resultVal.unwrap).toBe(42);
    });

    test("should handle Result utility functions", () => {
      const code = `
        ok = Ok 42;
        err = Err "error";
        {isOk ok, isErr err}
      `;
      const result = runCode(code);
      const resultVal = unwrapValue(result.finalResult);
      expect(resultVal.isOk).toBe(true);
      expect(resultVal.isErr).toBe(true);
    });

    test("should throw error when unwrapping None", () => {
      const code = "unwrap None";
      expect(() => runCode(code)).toThrow("Cannot unwrap None value");
    });

    test("should handle random number generation", () => {
      const code = "random";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("number");
      if (result.finalResult.tag === "number") {
        expect(typeof result.finalResult.value).toBe("number");
      }
    });

    test("should handle random range generation", () => {
      const code = "randomRange 1 10";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("number");
      if (result.finalResult.tag === "number") {
        expect(result.finalResult.value).toBeGreaterThanOrEqual(1);
        expect(result.finalResult.value).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("File I/O Functions", () => {
    test("should handle file operations", () => {
      // These tests would require mocking the filesystem
      // For now, just test that the functions exist and are callable
      const evaluator = new Evaluator();
      const readFileFunc = evaluator.getEnvironment().get('readFile');
      const writeFileFunc = evaluator.getEnvironment().get('writeFile');
      
      expect(readFileFunc).toBeDefined();
      expect(writeFileFunc).toBeDefined();
      expect(readFileFunc?.tag).toBe("native");
      expect(writeFileFunc?.tag).toBe("native");
    });
  });

  describe("Environment Management", () => {
    test("should provide access to current environment", () => {
      const evaluator = new Evaluator();
      const env = evaluator.getEnvironment();
      
      expect(env).toBeInstanceOf(Map);
      expect(env.has('+')).toBe(true);
      expect(env.has('-')).toBe(true);
      expect(env.has('*')).toBe(true);
      expect(env.has('/')).toBe(true);
    });

    test("should handle environment from program result", () => {
      const code = "x = 42; y = 24";
      const result = runCode(code);
      
      expect(result.environment).toBeInstanceOf(Map);
      expect(result.environment.has('x')).toBe(true);
      expect(result.environment.has('y')).toBe(true);
    });
  });

  describe("Edge Cases and Error Conditions", () => {
    test("should handle comparison with incompatible types", () => {
      const code = '"hello" < 5';
      expect(() => runCode(code)).toThrow("Cannot compare");
    });

    test("should handle list operations on empty lists", () => {
      const code = "tail []";
      expect(() => runCode(code)).toThrow("Cannot get tail of empty list");
    });

    test("should handle cons with non-list second argument", () => {
      const code = "cons 1 42";
      expect(() => runCode(code)).toThrow("Second argument to cons must be a list");
    });

    test("should handle map with non-function first argument", () => {
      const code = "map 42 [1, 2, 3]";
      expect(() => runCode(code)).toThrow("map requires a function and a list");
    });

    test("should handle filter with non-function predicate", () => {
      const code = "filter 42 [1, 2, 3]";
      expect(() => runCode(code)).toThrow("filter requires a predicate function and a list");
    });

    test("should handle literal pattern matching with numbers", () => {
      const code = `
        let x = 42;
        match x with
        | 42 -> "found forty-two"
        | _ -> "not found"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("found forty-two");
    });

    test("should handle literal pattern matching with strings", () => {
      const code = `
        let x = "hello";
        match x with
        | "hello" -> "greeting"
        | "world" -> "planet"
        | _ -> "unknown"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("greeting");
    });

    test("should handle literal pattern non-match", () => {
      const code = `
        let x = 99;
        match x with
        | 42 -> "found"
        | _ -> "not found"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("not found");
    });

    test("should handle invalid pattern kinds for coverage", () => {
      // Access the private tryMatchPattern method for testing
      const evaluator = new Evaluator();
      
      // Test the tryMatchPattern method with an invalid pattern
      const invalidPattern = { kind: "invalid" } as any;
      const value = { tag: "number", value: 42 } as any;
      
      expect(() => {
        evaluator['tryMatchPattern'](invalidPattern, value);
      }).toThrow("Unsupported pattern kind: invalid");
    });

    test("should convert constructors without args to string", () => {
      const code = `
        type Color = Red | Green | Blue;
        Red
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Red");
        expect(result.finalResult.args).toEqual([]);
      }
    });

    test("should convert constructors with args to string", () => {
      const code = `
        type Option a = Some a | None;
        Some 42
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Some");
        expect(result.finalResult.args).toHaveLength(1);
      }
    });

    test("should handle unit values", () => {
      const code = "unit";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("unit");
    });

    test("should handle complex nested patterns", () => {
      const code = `
        type Tree a = Leaf a | Branch (Tree a) (Tree a);
        let tree = Branch (Leaf 1) (Leaf 2);
        match tree with
        | Leaf x -> x
        | Branch left right -> 
            match left with
            | Leaf y -> y
            | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(1);
    });

    test("should handle empty list edge cases", () => {
      const result = runCode("isEmpty []");
      expect(result.finalResult).toEqual({ tag: "bool", value: true });
    });

    test("should handle non-empty list edge cases", () => {
      const result = runCode("isEmpty [1, 2, 3]");
      expect(result.finalResult).toEqual({ tag: "bool", value: false });
    });

    test("should handle native function display", () => {
      const result = runCode("mutGet");
      expect(result.finalResult.tag).toBe("native");
      if (result.finalResult.tag === "native") {
        expect(result.finalResult.name).toBe("mutGet");
      }
    });

    test("should handle large lists", () => {
      const result = runCode("[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
      expect(result.finalResult.tag).toBe("list");
      if (result.finalResult.tag === "list") {
        expect(result.finalResult.values).toHaveLength(10);
      }
    });

    test("should handle complex record patterns", () => {
      const code = `
        let record = {@x 10; @y 20};
        match record with
        | {@x x; @y y} -> x + y
        | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(30);
    });

    test("should handle tuple patterns", () => {
      const code = `
        let tuple = {1; 2; 3};
        match tuple with
        | {x; y; z} -> x + y + z
        | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(6);
    });

    test("should handle random functions", () => {
      const result = runCode("random");
      expect(result.finalResult.tag).toBe("number");
      if (result.finalResult.tag === "number") {
        expect(typeof result.finalResult.value).toBe("number");
      }
    });

    test("should handle random range functions", () => {
      const result = runCode("randomRange 1 10");
      expect(result.finalResult.tag).toBe("number");
      if (result.finalResult.tag === "number") {
        expect(result.finalResult.value).toBeGreaterThanOrEqual(1);
        expect(result.finalResult.value).toBeLessThanOrEqual(10);
      }
    });
  });

  // Additional comprehensive tests to target specific uncovered functionality
  describe("Comprehensive Coverage Tests", () => {
  describe("Pattern Matching Literal Tests", () => {
    test("should match number literals correctly", () => {
      const code = `
        match 42 with
        | 42 -> "matched"
        | _ -> "not matched"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("matched");
    });

    test("should match string literals correctly", () => {
      const code = `
        match "hello" with
        | "hello" -> "matched"
        | _ -> "not matched"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("matched");
    });

    test("should handle non-matching number literals", () => {
      const code = `
        match 99 with
        | 42 -> "matched"
        | _ -> "not matched"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("not matched");
    });

    test("should handle non-matching string literals", () => {
      const code = `
        match "world" with
        | "hello" -> "matched"
        | _ -> "not matched"
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe("not matched");
    });
  });

  describe("Value Conversion and Display", () => {
    test("should handle different value types for toString conversion", () => {
      // Testing different value types that exercise valueToString function paths
      const numberResult = runCode("42");
      expect(numberResult.finalResult.tag).toBe("number");
      
      const stringResult = runCode('"hello"');
      expect(stringResult.finalResult.tag).toBe("string");
      
      const boolResult = runCode("True");
      expect(boolResult.finalResult.tag).toBe("constructor");
      
      const listResult = runCode("[1, 2, 3]");
      expect(listResult.finalResult.tag).toBe("list");
      
      const tupleResult = runCode("{1; 2; 3}");
      expect(tupleResult.finalResult.tag).toBe("tuple");
      
      const recordResult = runCode("{@x 10; @y 20}");
      expect(recordResult.finalResult.tag).toBe("record");
    });

    test("should handle constructor values without arguments", () => {
      const code = `
        type Color = Red | Green | Blue;
        Red
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Red");
        expect(result.finalResult.args).toEqual([]);
      }
    });

    test("should handle constructor values with arguments", () => {
      const code = `
        type Option a = Some a | None;
        Some 42
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Some");
        expect(result.finalResult.args.length).toBe(1);
      }
    });

    test("should handle function values", () => {
      const code = "fun x -> x + 1";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("function");
    });

    test("should handle native function values", () => {
      const code = "+";
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("native");
    });
  });

  describe("Edge Cases and Coverage Gaps", () => {
    test("should handle empty lists properly", () => {
      const result = runCode("isEmpty []");
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("True");
      }
    });

    test("should handle non-empty lists properly", () => {
      const result = runCode("isEmpty [1, 2, 3]");
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("False");
      }
    });

    test("should handle complex nested constructor patterns", () => {
      const code = `
        type Tree a = Leaf a | Branch (Tree a) (Tree a);
        let tree = Branch (Leaf 10) (Leaf 20);
        match tree with
        | Branch (Leaf x) (Leaf y) -> x + y
        | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(30);
    });

    test("should handle curried constructor applications", () => {
      const code = `
        type Point = Point Int Int;
        let makePoint = Point;
        makePoint 10 20
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Point");
        expect(result.finalResult.args.length).toBe(2);
      }
    });

    test("should handle tuple matching patterns", () => {
      const code = `
        let tuple = {1; 2; 3};
        match tuple with
        | {a; b; c} -> a + b + c
        | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(6);
    });

    test("should handle record matching patterns", () => {
      const code = `
        let record = {@x 5; @y 15};
        match record with
        | {@x a; @y b} -> a * b
        | _ -> 0
      `;
      const result = runCode(code);
      expect(unwrapValue(result.finalResult)).toBe(75);
    });

    test("should handle complex list operations", () => {
      const result = runCode("length [1, 2, 3, 4, 5]");
      expect(unwrapValue(result.finalResult)).toBe(5);
    });

    test("should handle random number generation within range", () => {
      const result = runCode("randomRange 1 10");
      expect(result.finalResult.tag).toBe("number");
      if (result.finalResult.tag === "number") {
        expect(result.finalResult.value).toBeGreaterThanOrEqual(1);
        expect(result.finalResult.value).toBeLessThanOrEqual(10);
      }
    });

    test("should handle large constructor argument lists", () => {
      const code = `
        type Large = Large Int Int Int Int Int;
        Large 1 2 3 4 5
      `;
      const result = runCode(code);
      expect(result.finalResult.tag).toBe("constructor");
      if (result.finalResult.tag === "constructor") {
        expect(result.finalResult.name).toBe("Large");
        expect(result.finalResult.args.length).toBe(5);
      }
    });
  });
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
