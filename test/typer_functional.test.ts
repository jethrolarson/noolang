import { describe, it, expect } from "@jest/globals";
import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import {
  typeProgram,
  typeToString,
  createTypeState,
  initializeBuiltins,
} from "../src/typer_functional";

// Helper function to parse a string into a program
const parseProgram = (source: string) => {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return parse(tokens);
};

describe("Functional Type Inference", () => {
  describe("Basic Types", () => {
    it("should infer integer literal", () => {
      const program = parseProgram("42");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should infer string literal", () => {
      const program = parseProgram('"hello"');
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe(
        "String"
      );
    });

    it("should infer boolean literal", () => {
      const program = parseProgram("true");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Bool");
    });
  });

  describe("Function Types", () => {
    it("should infer identity function", () => {
      const program = parseProgram("fn x => x");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe(
        "(α) -> α"
      );
    });

    it("should infer function with multiple parameters", () => {
      const program = parseProgram("fn x y => x + y");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe(
        "(Int) -> (Int) -> Int"
      );
    });

    it("should infer nested function", () => {
      const program = parseProgram("fn x => fn y => x + y");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe(
        "(Int) -> (Int) -> Int"
      );
    });
  });

  describe("Let Polymorphism", () => {
    it("should generalize identity function", () => {
      const program = parseProgram("id = fn x => x; id 42");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should allow polymorphic function to be used with different types", () => {
      const program = parseProgram('id = fn x => x; id 42; id "hello"');
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe(
        "String"
      );
    });

    it("should handle recursive definitions", () => {
      const program = parseProgram(
        "fact = fn n => if n == 0 then 1 else n * (fact (n - 1)); fact 5"
      );
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });
  });

  describe("Function Application", () => {
    it("should apply function to argument", () => {
      const program = parseProgram("(fn x => x + 1) 42");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should handle partial application", () => {
      const program = parseProgram(
        "add = fn x y => x + y; add5 = add 5; add5 3"
      );
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should handle curried application", () => {
      const program = parseProgram("add = fn x y => x + y; add 2 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });
  });

  describe("Binary Operators", () => {
    it("should infer arithmetic operations", () => {
      const program = parseProgram("2 + 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should infer comparison operations", () => {
      const program = parseProgram("2 < 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Bool");
    });

    it("should infer equality operations", () => {
      const program = parseProgram("2 == 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Bool");
    });
  });

  describe("If Expressions", () => {
    it("should infer if expression with same types", () => {
      const program = parseProgram("if true then 1 else 2");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should handle if expression with different types", () => {
      const program = parseProgram('if true then 1 else "hello"');
      expect(() => typeProgram(program)).toThrow();
    });
  });

  describe("Sequences", () => {
    it("should handle semicolon sequences", () => {
      const program = parseProgram("1; 2; 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should handle sequences with definitions", () => {
      const program = parseProgram("x = 1; y = 2; x + y");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });
  });

  describe("Built-in Functions", () => {
    it("should handle built-in arithmetic operators", () => {
      const program = parseProgram("2 + 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Int");
    });

    it("should handle built-in comparison operators", () => {
      const program = parseProgram("2 == 3");
      const result = typeProgram(program);
      expect(typeToString(result.type, result.state.substitution)).toBe("Bool");
    });
  });

  describe("Type Environment", () => {
    it("should initialize with built-ins", () => {
      const state = createTypeState();
      const newState = initializeBuiltins(state);

      expect(newState.environment.has("+")).toBe(true);
      expect(newState.environment.has("-")).toBe(true);
      expect(newState.environment.has("*")).toBe(true);
      expect(newState.environment.has("/")).toBe(true);
      expect(newState.environment.has("==")).toBe(true);
      expect(newState.environment.has(";")).toBe(true);
    });
  });

  describe("Error Cases", () => {
    it("should reject undefined variables", () => {
      const program = parseProgram("undefined_var");
      expect(() => typeProgram(program)).toThrow("Undefined variable");
    });

    it("should reject type mismatches in function application", () => {
      const program = parseProgram('(fn x => x + 1) "hello"');
      expect(() => typeProgram(program)).toThrow();
    });

    it("should reject non-boolean conditions in if expressions", () => {
      const program = parseProgram("if 42 then 1 else 2");
      expect(() => typeProgram(program)).toThrow();
    });
  });
});

describe("Constraint Propagation (Functional Typer)", () => {
  it("should throw a type error when constraints are not satisfied in composition", () => {
    const program = parseProgram(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [1, 2, 3]
    `);
    expect(() => typeProgram(program)).toThrow("constraint");
  });

  it("should allow composition when constraints are satisfied (functional typer)", () => {
    const program = parseProgram(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [[1, 2, 3], [4, 5, 6]]
    `);
    const result = typeProgram(program);
    const typeStr = typeToString(result.type, result.state.substitution);
    expect(typeStr).toBe("List Int");
  });
});
