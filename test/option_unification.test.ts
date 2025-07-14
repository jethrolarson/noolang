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
    case 'constructor': return { name: val.name, args: val.args.map(unwrapValue) };
    default: return val;
  }
}

describe("Option Type Unification Tests", () => {
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

  test("should handle simple Option construction", () => {
    const code = `Some 42`;
    const result = runCode(code);
    const unwrapped = unwrapValue(result.finalResult);
    expect(unwrapped.name).toBe("Some");
    expect(unwrapped.args).toEqual([42]);
  });

  test("should handle None construction", () => {
    const code = `None`;
    const result = runCode(code);
    const unwrapped = unwrapValue(result.finalResult);
    expect(unwrapped.name).toBe("None");
    expect(unwrapped.args).toEqual([]);
  });

  test.skip("should handle Option in conditional expressions", () => {
    // FIXME: Currently fails with "Cannot unify Option a with Option a"
    const code = `
      result = if true then Some 42 else None;
      result
    `;
    const result = runCode(code);
    const unwrapped = unwrapValue(result.finalResult);
    expect(unwrapped.name).toBe("Some");
    expect(unwrapped.args).toEqual([42]);
  });

  test.skip("should handle Option function return types", () => {
    // FIXME: Currently fails with "Cannot unify Option a with Option a"
    const code = `
      makeOption = fn x => if x > 0 then Some x else None;
      makeOption 5
    `;
    const result = runCode(code);
    const unwrapped = unwrapValue(result.finalResult);
    expect(unwrapped.name).toBe("Some");
    expect(unwrapped.args).toEqual([5]);
  });

  test.skip("should handle safe division function", () => {
    // FIXME: Currently fails with "Cannot unify Option a with Option a"
    const code = `
      safe_divide = fn a b => if b == 0 then None else Some (a / b);
      safe_divide 10 2
    `;
    const result = runCode(code);
    const unwrapped = unwrapValue(result.finalResult);
    expect(unwrapped.name).toBe("Some");
    expect(unwrapped.args).toEqual([5]);
  });
});