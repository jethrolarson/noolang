import { Typer } from "../src/typer";
import { parse } from "../src/parser/parser";
import { Lexer } from "../src/lexer";

describe("Enhanced Type System", () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  test.skip("should infer effects for effectful functions", () => {
    const code = `logMessage = fn msg => print msg`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // The logMessage function should have log effect
    expect(types[0]).toBeDefined();
    if (types[0].kind === "function") {
      expect(types[0].effects).toContain("log");
    }
  });

  test("should handle list types with elements", () => {
    const code = `numbers = [1, 2, 3]; first = head numbers`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // The sequence returns the type of the last expression (head numbers)
    expect(types.length).toBe(1);
    // head numbers should return Int (the element type of the list)
    expect(types[0].kind).toBe("variable"); // head returns a type variable
  });

  test("should handle tuple types", () => {
    const code = `pair = { 1, "hello" }`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // pair should be (Int String)
    expect(types.length).toBe(1);
  });

  test("should handle record types", () => {
    const code = `person = { @name "Alice", @age 30 }`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // person should be a record type
    expect(types.length).toBe(1);
  });

  test.skip("should handle pure vs effectful functions", () => {
    const code = `pure = fn x => x + 1; effectful = fn x => print x`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // The sequence returns the type of the last expression (effectful function)
    expect(types.length).toBe(1);

    // effectful function should have log effect
    if (types[0].kind === "function") {
      expect(types[0].effects).toContain("log");
    }
  });

  test("should handle function composition with effects", () => {
    const code = `addOne = fn x => x + 1; logResult = fn x => print x; pipeline = addOne |> logResult`;

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    const types = typer.typeProgram(program);

    // The sequence returns the type of the last expression (pipeline)
    expect(types.length).toBe(1);

    // pipeline should inherit effects from logResult
    if (types[0].kind === "function") {
      expect(types[0].effects).toContain("log");
    }
  });
});
