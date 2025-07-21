import { Evaluator, Value } from "../src/evaluator";
import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { typeAndDecorate, typeProgram } from "../src/typer";
import { typeToString } from "../src/typer/helpers";

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== "object") return val;
  switch (val.tag) {
    case "number":
      return val.value;
    case "string":
      return val.value;
    case "constructor":
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

describe("Safe Thrush Operator (|?)", () => {
  let evaluator: Evaluator;

  function evalExpression(source: string) {
    const tokens = new Lexer(source).tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    const result = evaluator.evaluateProgram(decoratedResult.program);
    return unwrapValue(result.finalResult);
  }

  function typeCheckExpression(source: string) {
    const tokens = new Lexer(source).tokenize();
    const ast = parse(tokens);
    const result = typeProgram(ast);
    return typeToString(result.type, result.state.substitution);
  }

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  describe("Basic Functionality", () => {
    test("should apply function to Some value", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
      expect(result).toEqual({
        tag: "constructor",
        name: "Some", 
        args: [{ tag: "number", value: 15 }]
      });
    });

    test("should short-circuit on None", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
      expect(result).toEqual({
        tag: "constructor", 
        name: "None", 
        args: []
      });
    });

    test("should work with inline function", () => {
      const result = evalExpression(`Some 10 |? (fn x => x * 2)`);
      expect(result).toEqual({
        tag: "constructor",
        name: "Some", 
        args: [{ tag: "number", value: 20 }]
      });
    });
  });

  describe("Monadic Bind Behavior", () => {
    test("should handle function returning Option (monadic bind)", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        Some 10 |? safe_divide
      `);
      expect(result).toEqual({
        tag: "constructor",
        name: "Some", 
        args: [{ tag: "number", value: 10 }]
      });
    });

    test("should return None when function returns None", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        Some 0 |? safe_divide
      `);
      expect(result).toEqual({ tag: "constructor", name: "None", args: [] });
    });

    test("should not double-wrap Option results", () => {
      // This tests that |? implements monadic bind, not functor map
      const result = evalExpression(`
        wrap_in_some = fn x => Some (x + 1);
        Some 5 |? wrap_in_some
      `);
      // Should be Some 6, not Some (Some 6)
      expect(result).toEqual({
        tag: "constructor",
        name: "Some", 
        args: [{ tag: "number", value: 6 }]
      });
    });
  });

  describe("Chaining Operations", () => {
    test("should support chaining multiple |? operations", () => {
      const result = evalExpression(`
        add_five = fn x => x + 5;
        multiply_two = fn x => x * 2;
        Some 10 |? add_five |? multiply_two
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 30 }] });
    });

    test("should short-circuit in chains when None encountered", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        subtract_five = fn x => x - 5;
        Some 5 |? subtract_five |? safe_divide
      `);
      expect(result).toEqual({
        tag: "constructor", 
        name: "None", 
        args: []
      });
    });

    test("should work with mixed regular and Option-returning functions", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        Some 10 |? add_ten |? safe_divide
      `);
      expect(result).toEqual({
        tag: "constructor",
        name: "Some", 
        args: [{ tag: "number", value: 5 }]
      });
    });
  });

  describe("Type Inference", () => {
    test("should infer Option type for result", () => {
      const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
      expect(type).toMatch(/Option.*Int/);
    });

    test("should handle None type correctly", () => {
      const type = typeCheckExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
      expect(type).toMatch(/Option.*Int/);
    });
  });

  describe("Error Handling", () => {
    test("should require right operand to be a function", () => {
      expect(() => evalExpression(`Some 5 |? 42`))
        .toThrow(/non-function/);
    });
  });
});