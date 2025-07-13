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

describe("Type Constraints", () => {
  describe("Basic Constraint System", () => {
    it("should support constrained type variables", () => {
      const state = createTypeState();
      const newState = initializeBuiltins(state);

      // Check that head has a constraint
      const headScheme = newState.environment.get("head");
      expect(headScheme).toBeDefined();
      expect(headScheme!.type.kind).toBe("function");
      if (headScheme!.type.kind === "function") {
        expect(headScheme!.type.constraints).toBeDefined();
        expect(headScheme!.type.constraints!.length).toBeGreaterThan(0);
        expect(headScheme!.type.constraints![0].kind).toBe("is");
      }
    });

    it("should display constraints in type strings", () => {
      const state = createTypeState();
      const newState = initializeBuiltins(state);

      const headScheme = newState.environment.get("head");
      expect(headScheme).toBeDefined();

      const typeStr = typeToString(headScheme!.type, newState.substitution);
      expect(typeStr).toContain("given");
      expect(typeStr).toContain("is Collection");
    });
  });

  describe("Constraint Solving", () => {
    it("should solve constraints during unification", () => {
      const program = parseProgram("head [1, 2, 3]");
      const result = typeProgram(program);
      const typeStr = typeToString(result.type, result.state.substitution);

      // The constraint should be solved and the type should be Int
      expect(typeStr).toBe("Int");
    });

    it("should solve constraints for polymorphic functions", () => {
      const program = parseProgram(`
        id = fn x => x;
        head (id [1, 2, 3])
      `);
      const result = typeProgram(program);
      const typeStr = typeToString(result.type, result.state.substitution);

      // The constraint should be solved through the polymorphic function
      expect(typeStr).toBe("Int");
    });
  });

  describe("Constraint Error Handling", () => {
    it("should reject types that don't satisfy constraints", () => {
      // This would require a more sophisticated constraint system
      // For now, we'll test that constraints are properly tracked
      const program = parseProgram("head 42");

      // This should fail because 42 is not a Collection
      expect(() => typeProgram(program)).toThrow();
    });
  });

  describe("Built-in Constrained Functions", () => {
    it("should have constrained types for list operations", () => {
      const state = createTypeState();
      const newState = initializeBuiltins(state);

      const functions = ["head", "tail", "length"];

      for (const funcName of functions) {
        const scheme = newState.environment.get(funcName);
        expect(scheme).toBeDefined();
        expect(scheme!.type.kind).toBe("function");

        if (scheme!.type.kind === "function") {
          expect(scheme!.type.constraints).toBeDefined();
          expect(scheme!.type.constraints!.length).toBeGreaterThan(0);

          const typeStr = typeToString(scheme!.type, newState.substitution);
          expect(typeStr).toContain("given");
          expect(typeStr).toContain("is Collection");
        }
      }
    });
  });

  describe("Constraint Propagation", () => {
    it("should propagate constraints through function composition", () => {
      const program = parseProgram(`
        compose = fn f g => fn x => f (g x);
        safeHead = compose head;
        id = fn x => x;
        result = safeHead id [1, 2, 3]
      `);

      // This should fail because id returns Int, not a Collection
      expect(() => typeProgram(program)).toThrow("constraint");
    });

    it("should allow composition when constraints are satisfied", () => {
      const program = parseProgram(`
        compose = fn f g => fn x => f (g x);
        safeHead = compose head;
        listId = fn x => x;
        result = safeHead listId [[1, 2, 3], [4, 5, 6]]
      `);

      const result = typeProgram(program);
      const typeStr = typeToString(result.type, result.state.substitution);

      // The result should be List Int, and constraints should be properly handled
      expect(typeStr).toBe("List Int");
    });
  });
});
