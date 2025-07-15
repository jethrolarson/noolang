import { parse } from "../src/parser/parser";
import { Lexer } from "../src/lexer";
import { typeProgram } from "../src/typer_functional";
import { Evaluator } from "../src/evaluator";

const parseProgram = (code: string) => {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  return parse(tokens);
};

describe("Accessor Constraints", () => {
  describe("hasField constraint generation", () => {
    it("should generate hasField constraints for record accessors", () => {
      const program = parseProgram("getName = @name; getName {@name \"Alice\"}");
      const result = typeProgram(program);
      expect(result).toBeDefined();
    });

    it("should reject accessor on record without field", () => {
      const program = parseProgram("getName = @name; getName {@age 30}");
      expect(() => typeProgram(program)).toThrow();
    });

    it("should work with partial accessor application", () => {
      const program = parseProgram("getName = @name");
      const result = typeProgram(program);
      expect(result).toBeDefined();
    });

    it("should enforce field types", () => {
      const program = parseProgram("getName = @name; getName {@name 42}");
      const result = typeProgram(program);
      expect(result).toBeDefined(); // Should type check with name: Int
    });
  });

  describe("Runtime accessor behavior", () => {
    it("should work with valid field access", () => {
      const evaluator = new Evaluator();
      const program = parseProgram('getName = @name; getName {@name "Alice"}');
      const result = evaluator.evaluateProgram(program);
      expect(result.finalResult).toEqual({tag: "string", value: "Alice"});
    });

    it("should handle missing field at runtime", () => {
      const evaluator = new Evaluator();
      const program = parseProgram('getName = @name; getName {@age 30}');
      expect(() => evaluator.evaluateProgram(program)).toThrow();
    });
  });

  describe("Multiple field constraints", () => {
    it("should handle multiple field accesses", () => {
      const program = parseProgram(`
        getAge = fn person => (@age person) + 1;
        getAge {@age 25}
      `);
      const result = typeProgram(program);
      expect(result).toBeDefined();
    });

    it("should reject when multiple fields are missing", () => {
      const program = parseProgram(`
        getAge = fn person => (@age person) + 1;
        getAge {@name "Alice Smith"}
      `);
      expect(() => typeProgram(program)).toThrow();
    });
  });
});