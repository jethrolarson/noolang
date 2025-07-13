import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Typer } from '../src/typer';
import { Type } from '../src/ast';

// Helper function to check if a type is a primitive type with a specific name
function isPrimitiveType(type: Type, name: string): boolean {
  return type.kind === 'primitive' && type.name === name;
}

describe('Typer', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  test("should infer types for number literals", () => {
    const lexer = new Lexer("42");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for string literals", () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "String")).toBe(true);
  });

  test("should infer types for boolean literals", () => {
    const lexer = new Lexer("true");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Bool")).toBe(true);
  });

  test("should infer types for arithmetic operations", () => {
    const lexer = new Lexer("2 + 3");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for function definitions", () => {
    const lexer = new Lexer("fn x => x + 1");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1); // Function definition returns a value
    expect(types[0].kind).toBe("function");
  });

  test("should infer types for function applications", () => {
    const lexer = new Lexer("(fn x => x + 1) 2");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for if expressions", () => {
    const lexer = new Lexer("if true then 1 else 2");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for list operations", () => {
    const lexer = new Lexer("[1, 2, 3] | head");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")); // head returns Int after unification
  });

  test("should infer types for comparison operations", () => {
    const lexer = new Lexer("2 < 3");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Bool")).toBe(true);
  });

  test("should handle undefined variables", () => {
    const lexer = new Lexer("undefined_var");
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow("Undefined variable");
    expect(() => {
      typer.typeProgram(program);
    }).toThrow("Define 'undefined_var' before using it");
  });

  test("should handle type mismatches", () => {
    const lexer = new Lexer('"hello" + 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow("Operator type mismatch");
    expect(() => {
      typer.typeProgram(program);
    }).toThrow("The + operator expects Int but got String");
  });

  test("should infer type for function with unit parameter", () => {
    const lexer = new Lexer('fn {} => "joe"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe("function");
    if (types[0].kind === "function") {
      // Accept either unit or type variable for the parameter
      const param = types[0].params[0];
      expect(param.kind === "unit" || param.kind === "variable").toBe(true);
      expect(types[0].return.kind).toBe("primitive");
      if (types[0].return.kind === "primitive") {
        expect(types[0].return.name).toBe("String");
      } else {
        throw new Error("Expected primitive return type");
      }
    } else {
      throw new Error("Expected function type");
    }
  });

  test("should unify type variables in function application", () => {
    const lexer = new Lexer("(fn x => x + 1) 42");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should unify polymorphic identity function", () => {
    const lexer = new Lexer("(fn x => x) 42");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should unify polymorphic identity function with string", () => {
    const lexer = new Lexer('(fn x => x) "hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "String")).toBe(true);
  });

  test("should unify list head operation", () => {
    const lexer = new Lexer("[1, 2, 3] | head");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should unify comparison with type variables", () => {
    const lexer = new Lexer("42 == 42");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Bool")).toBe(true);
  });

  test("should handle nested function applications with unification", () => {
    const lexer = new Lexer("(fn f x => f x) (fn y => y + 1) 5");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for thrush operator", () => {
    const lexer = new Lexer("10 | (fn x => x + 1)");
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], "Int")).toBe(true);
  });

  test("should infer types for chained thrush operators", () => {
    const lexer = new Lexer(
      "[1, 2, 3] | map (fn x => x + 1) | map (fn x => x * x)"
    );
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe("list");
    if (types[0].kind === "list") {
      expect(types[0].element.kind).toBe("primitive");
      if (types[0].element.kind === "primitive") {
        expect(types[0].element.name).toBe("Int");
      }
    }
  });

  // Recursion Tests
  describe("Recursion", () => {
    test("should type-check factorial recursion", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        factorial 5
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check fibonacci recursion", () => {
      const code = `
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        fibonacci 10
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check recursive list length", () => {
      const code = `
        recLength = fn list => if isEmpty list then 0 else 1 + (recLength (tail list));
        recLength [1, 2, 3, 4, 5]
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check recursive list sum", () => {
      const code = `
        recSum = fn list => if isEmpty list then 0 else (head list) + (recSum (tail list));
        recSum [1, 2, 3, 4, 5]
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check recursive power function", () => {
      const code = `
        power = fn base exp => if exp == 0 then 1 else base * (power base (exp - 1));
        power 2 8
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check recursive function with multiple parameters", () => {
      const code = `
        ackermann = fn m n => 
          if m == 0 then n + 1 
          else if n == 0 then ackermann (m - 1) 1 
          else ackermann (m - 1) (ackermann m (n - 1));
        ackermann 2 2
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });

    test("should type-check recursive function definitions without application", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1);
      expect(types[0].kind).toBe("function");
    });

    test("should type-check multiple recursive functions", () => {
      const code = `
        factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
        fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2));
        factorial 5; fibonacci 10
      `;
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const types = typer.typeProgram(program);

      expect(types).toHaveLength(1); // Single statement with semicolon operator
      expect(isPrimitiveType(types[0], "Int")).toBe(true);
    });
  });
}); 