import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";

describe("Records, Tuples, and Unit", () => {
  function parseNoo(src: string) {
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    return parse(tokens);
  }

  test("parses named record", () => {
    const program = parseNoo("{ @a 1, @b 2 }");
    const record = program.statements[0];
    expect(record.kind).toBe("record");
    if (record.kind === "record") {
      expect(record.fields).toEqual([
        { name: "a", value: expect.anything() },
        { name: "b", value: expect.anything() },
      ]);
    }
  });

  test("parses tuple (nameless record)", () => {
    const program = parseNoo("{ 1, 2 }");
    const tuple = program.statements[0];
    expect(tuple.kind).toBe("tuple");
    if (tuple.kind === "tuple") {
      expect(tuple.elements.length).toBe(2);
      expect(tuple.elements[0]).toEqual(expect.anything());
      expect(tuple.elements[1]).toEqual(expect.anything());
    }
  });

  test("parses unit (empty braces)", () => {
    const program = parseNoo("{ }");
    const unit = program.statements[0];
    expect(unit.kind).toBe("unit");
  });

  test("throws on mixed named and positional fields", () => {
    expect(() => parseNoo("{ 1, @a 2 }")).toThrow();
    expect(() => parseNoo("{ @a 2, 1 }")).toThrow();
  });
});
