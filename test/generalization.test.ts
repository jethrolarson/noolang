import { parse } from "../src/parser/parser";
import { Lexer } from "../src/lexer";
import { Typer } from "../src/typer";

describe("Generalization and Let-Polymorphism", () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  test("polymorphic identity function", () => {
    const tokens = new Lexer("id = fn x => x").tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);

    // The identity function should be generalized to work with any type
    expect(typer.typeToString(types[0])).toBe("(α) -> α");
  });

  test("polymorphic function can be used with different types", () => {
    const tokens = new Lexer(`
      id = fn x => x;
      num = id 42;
      str = id "hello";
      bool = id true
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should not throw type errors - id should work with any type
    // The sequence returns the type of the rightmost expression
    expect(types).toHaveLength(1);
    expect(typer.typeToString(types[0])).toBe("Bool"); // The type of the final expression
  });

  test("higher-order functions with generalization", () => {
    const tokens = new Lexer(`
      apply = fn f x => f x;
      double = fn x => x * 2;
      result = apply double 5
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - apply should be polymorphic
    // The sequence returns the type of the rightmost expression
    expect(types).toHaveLength(1);
    expect(typer.typeToString(types[0])).toBe("Int"); // The type of the final expression
  });

  test("recursive polymorphic functions", () => {
    const tokens = new Lexer(`
      map = fn f xs =>
        if isEmpty xs then []
        else cons (f (head xs)) (map f (tail xs))
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - map should be polymorphic
    expect(types).toHaveLength(1);
    // map should have type (α -> β) -> List α -> List β
    expect(typer.typeToString(types[0])).toBe("((α) -> β) -> List α -> List β");
  });

  test("let-polymorphism with nested definitions", () => {
    const tokens = new Lexer(`
      outer = fn x => (
        inner = fn y => x;
        inner 42
      )
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - inner should be generalized
    expect(types).toHaveLength(1);
    // outer should have type α -> α
    expect(typer.typeToString(types[0])).toBe("(α) -> α");
  });

  test("polymorphic functions in records", () => {
    const tokens = new Lexer(`
      utils = {
        @id fn x => x,
        @const fn x y => x,
        @flip fn f x y => f y x
      };
      result1 = (@id utils) 42;
      result2 = (@const utils) "hello" 123;
      result3 = (@flip utils) (fn x y => x + y) 5 3
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - functions in records should be polymorphic
    // The sequence returns the type of the rightmost expression
    expect(types).toHaveLength(1);
    expect(typer.typeToString(types[0])).toBe("Int"); // The type of the final expression
  });

  test("curried polymorphic functions", () => {
    const tokens = new Lexer(`
      add = fn x y => x + y;
      addFive = add 5;
      result = addFive 3
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - partial application should preserve polymorphism
    // The sequence returns the type of the rightmost expression
    expect(types).toHaveLength(1);
    expect(typer.typeToString(types[0])).toBe("Int"); // The type of the final expression
  });

  test("polymorphic functions with type annotations", () => {
    const tokens = new Lexer(`
      id = fn x => x : a -> a;
      result = id 42
    `).tokenize();
    const program = parse(tokens);

    // Type the program and get the types
    const types = typer.typeProgram(program);

    // Should work correctly - explicit type annotations should work with generalization
    // The sequence returns the type of the rightmost expression
    expect(types).toHaveLength(1);
    expect(typer.typeToString(types[0])).toBe("Int"); // The type of the final expression
  });

  test("debug: what type does id get?", () => {
    const tokens = new Lexer("id = fn x => x").tokenize();
    const program = parse(tokens);

    // Type the program
    typer.typeProgram(program);

    // Check what's in the environment
    const env = typer.getTypeEnvironment();
    const idType = env.get("id");

    // Now try to use it
    const useTokens = new Lexer("id 42").tokenize();
    const useProgram = parse(useTokens);

    try {
      const useTypes = typer.typeProgram(useProgram);
      expect(typer.typeToString(useTypes[0])).toBe("Int");
    } catch (error: any) {
      fail(`Expected id 42 to work, but got error: ${error.message}`);
    }
  });
});
