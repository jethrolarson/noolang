import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { Evaluator } from "../src/evaluator";

describe("File-relative imports", () => {
  let evaluator: Evaluator;
  let mockReadFileSync: any;
  let mockExistsSync: any;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock("fs", () => ({
      readFileSync: jest.fn((filePath: any) => {
        if (typeof filePath === "string" && filePath.includes("stdlib.noo")) {
          return "# Noolang Standard Library\n# This file defines the global default environment\n";
        }
        if (
          typeof filePath === "string" &&
          filePath.includes("math_functions.noo")
        ) {
          return "{ @add fn x y => x + y, @multiply fn x y => x * y }";
        }
        throw new Error(`File not found: ${filePath}`);
      }),
      existsSync: jest.fn((filePath: any) => {
        if (typeof filePath === "string" && filePath.includes("stdlib.noo")) {
          return true;
        }
        if (
          typeof filePath === "string" &&
          filePath.includes("math_functions.noo")
        ) {
          return true;
        }
        return false;
      }),
    }));

    // Re-import fs after mocking
    const fs = require("fs");
    mockReadFileSync = fs.readFileSync;
    mockExistsSync = fs.existsSync;
  });

  afterAll(() => {
    jest.resetModules();
    jest.dontMock("fs");
  });

  beforeEach(() => {
    evaluator = new Evaluator();
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
      "/test/dir/test_file.noo",
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
      "/test/dir/subdir/test_file.noo",
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
      "/test/dir/test_file.noo",
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
