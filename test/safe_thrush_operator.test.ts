import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
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
    case "record":
      const result: any = {};
      for (const [key, value] of Object.entries(val.fields)) {
        result[key] = unwrapValue(value);
      }
      return result;
    case "tuple":
      return val.values.map(unwrapValue);
    case "function":
      return val;
    case "unit":
      return {};
    default:
      return val;
  }
}

describe("Safe Thrush Operator (|?)", () => {
  const evaluator = new Evaluator();

  function evalExpression(source: string) {
    const tokens = new Lexer(source).tokenize();
    const ast = parse(tokens);
    const result = evaluator.evaluateProgram(ast);
    return unwrapValue(result.finalResult);
  }

  describe("Basic functionality", () => {
    test("should apply function to Some value", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        Some 5 |? add_ten
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 15 }] });
    });

    test("should return None for None value", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        None |? add_ten
      `);
      expect(result).toEqual({ tag: "constructor", name: "None", args: [] });
    });

    test("should wrap non-Option values in Some", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        5 |? add_ten
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 15 }] });
    });
  });

  describe("Monadic bind behavior", () => {
    test("should not double-wrap when function returns Option", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        Some 10 |? safe_divide
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 10 }] });
    });

    test("should propagate None from function that returns None", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        Some 0 |? safe_divide
      `);
      expect(result).toEqual({ tag: "constructor", name: "None", args: [] });
    });

    test("should handle chaining with Option-returning functions", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        safe_sqrt = fn x => if x < 0 then None else Some x;
        Some 25 |? safe_divide |? safe_sqrt
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 4 }] });
    });

    test("should short-circuit on None in chain", () => {
      const result = evalExpression(`
        safe_divide = fn x => if x == 0 then None else Some (100 / x);
        safe_sqrt = fn x => if x < 0 then None else Some x;
        Some 0 |? safe_divide |? safe_sqrt
      `);
      expect(result).toEqual({ tag: "constructor", name: "None", args: [] });
    });
  });



  describe("Complex examples", () => {
    test("should handle complex chaining", () => {
      const result = evalExpression(`
        add_ten = fn x => x + 10;
        double = fn x => x * 2;
        Some 5 |? add_ten |? double
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "number", value: 30 }] });
    });

    test("should work with different data types", () => {
      const result = evalExpression(`
        concat_hello = fn s => concat s " world";
        Some "hello" |? concat_hello
      `);
      expect(result).toEqual({ tag: "constructor", name: "Some", args: [{ tag: "string", value: "hello world" }] });
    });

    test("should integrate with existing Option utilities", () => {
      const result = evalExpression(`
        double = fn x => x * 2;
        handle_option = fn opt => match opt with (
          Some value => value;
          None => 0
        );
        result = Some 10 |? double;
        handle_option result
      `);
      expect(result).toBe(20);
    });
  });

  describe("Error handling", () => {
    test("should error when applying non-function", () => {
      expect(() => {
        evalExpression(`Some 5 |? 10`);
      }).toThrow(/Cannot apply non-function in safe thrush/);
    });
  });
});