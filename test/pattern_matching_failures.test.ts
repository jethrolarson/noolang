import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { typeAndDecorate } from "../src/typer_functional";
import { Evaluator, Value } from "../src/evaluator";

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== 'object') return val;
  switch (val.tag) {
    case "number":
      return val.value;
    case "string":
      return val.value;
    case "constructor":
      if (val.name === "True") return true;
      if (val.name === "False") return false;
      return { name: val.name, args: val.args.map(unwrapValue) };
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

describe("Pattern Matching Failure Tests", () => {
  let evaluator: Evaluator;

  beforeEach(() => {
    evaluator = new Evaluator();
  });

  const runCode = (code: string) => {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    return evaluator.evaluateProgram(decoratedResult.program);
  };

  test.skip("should handle parametric ADT pattern matching", () => {
    // FIXME: Currently fails with "Pattern expects constructor but got α"
    const code = `
      type Point a = Point a a;
      get_x = fn point => match point with (Point x y => x);
      origin = Point 0 0;
      get_x origin
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(0);
  });

  test.skip("should handle Option pattern matching in functions", () => {
    // FIXME: Currently fails with "Pattern expects constructor but got α"
    const code = `
      handle_option = fn opt => match opt with (
        Some value => value * 2;
        None => 0
      );
      handle_option (Some 21)
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(42);
  });

  test.skip("should handle Result pattern matching", () => {
    // FIXME: Currently fails with "Pattern expects constructor but got α"
    const code = `
      handle_result = fn res => match res with (
        Ok value => value + 10;
        Err msg => 0
      );
      handle_result (Ok 32)
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(42);
  });

  test.skip("should handle complex Shape pattern matching", () => {
    // FIXME: Currently fails with "Pattern expects constructor but got α"
    const code = `
      type Shape = Circle Number | Rectangle Number Number;
      calculate_area = fn shape => match shape with (
        Circle radius => radius * radius * 3;
        Rectangle width height => width * height
      );
      calculate_area (Circle 5)
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(75);
  });
});