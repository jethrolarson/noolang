import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { typeAndDecorate } from "../src/typer_functional";
import { Evaluator, Value } from "../src/evaluator";

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== 'object') return val;
  switch (val.tag) {
    case 'number': return val.value;
    case 'string': return val.value;
    case 'boolean': return val.value;
    case 'list': return val.values.map(unwrapValue);
    case 'tuple': return val.values.map(unwrapValue);
    case 'record': {
      const obj: any = {};
      for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
      return obj;
    }
    default: return val;
  }
}

describe("Head Function Tests", () => {
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

  test("should work with integer lists", () => {
    const code = `
      numbers = [1, 2, 3, 4, 5];
      head numbers
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(1);
  });

  test("should work with string lists", () => {
    const code = `
      strings = ["hello", "world", "noolang"];
      head strings
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe("hello");
  });

  test("should work with boolean lists", () => {
    const code = `
      bools = [true, false, true];
      head bools
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toBe(true);
  });

  test("should work with nested lists", () => {
    const code = `
      nested = [[1, 2], [3, 4]];
      head nested
    `;
    const result = runCode(code);
    expect(unwrapValue(result.finalResult)).toEqual([1, 2]);
  });
});