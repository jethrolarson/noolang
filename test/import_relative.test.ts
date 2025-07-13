import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { Evaluator } from "../src/evaluator";
import * as fs from "fs";

// Mock fs.readFileSync
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

describe("File-relative imports", () => {
  let evaluator: Evaluator;
  const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
    typeof fs.readFileSync
  >;

  beforeEach(() => {
    evaluator = new Evaluator();
    mockReadFileSync.mockReset();
  });

  test("should import from same directory", () => {
    // Create a temporary test file that imports from the same directory
    const testCode = `
      math = import "math_functions";
      (@add math) 2 3
    `;

    const lexer = new Lexer(testCode);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    // Mock the file system to simulate the math_functions module
    mockReadFileSync.mockImplementation((filePath: any) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("math_functions.noo")
      ) {
        return "{ @add fn x y => x + y, @multiply fn x y => x * y }";
      }
      throw new Error(`File not found: ${filePath}`);
    });

    const result = evaluator.evaluateProgram(
      program,
      "/test/dir/test_file.noo"
    );
    expect(result.finalResult).toEqual({ tag: "number", value: 5 });
  });

  test("should import from parent directory", () => {
    // Create a temporary test file that imports from parent directory
    const testCode = `
      math = import "../math_functions";
      (@add math) 10 20
    `;

    const lexer = new Lexer(testCode);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    // Mock the file system to simulate the math_functions module
    mockReadFileSync.mockImplementation((filePath: any) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("math_functions.noo")
      ) {
        return "{ @add fn x y => x + y, @multiply fn x y => x * y }";
      }
      throw new Error(`File not found: ${filePath}`);
    });

    const result = evaluator.evaluateProgram(
      program,
      "/test/dir/subdir/test_file.noo"
    );
    expect(result.finalResult).toEqual({ tag: "number", value: 30 });
  });

  test("should handle absolute paths", () => {
    // Create a temporary test file that imports using absolute path
    const testCode = `
      math = import "/absolute/path/math_functions";
      (@add math) 5 10
    `;

    const lexer = new Lexer(testCode);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    // Mock the file system to simulate the math_functions module
    mockReadFileSync.mockImplementation((filePath: any) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("math_functions.noo")
      ) {
        return "{ @add fn x y => x + y, @multiply fn x y => x * y }";
      }
      throw new Error(`File not found: ${filePath}`);
    });

    const result = evaluator.evaluateProgram(
      program,
      "/test/dir/test_file.noo"
    );
    expect(result.finalResult).toEqual({ tag: "number", value: 15 });
  });

  test("should fall back to current working directory when no file path provided", () => {
    // Create a temporary test file that imports without file path context
    const testCode = `
      math = import "math_functions";
      (@add math) 3 7
    `;

    const lexer = new Lexer(testCode);
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    // Mock the file system to simulate the math_functions module
    mockReadFileSync.mockImplementation((filePath: any) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("math_functions.noo")
      ) {
        return "{ @add fn x y => x + y, @multiply fn x y => x * y }";
      }
      throw new Error(`File not found: ${filePath}`);
    });

    const result = evaluator.evaluateProgram(program); // No file path
    expect(result.finalResult).toEqual({ tag: "number", value: 10 });
  });
});
