import { Lexer } from "../src/lexer";
import { parse } from "../src/parser/parser";
import { typeAndDecorate } from "../src/typer/decoration";

describe("Top-level Constraint and Implement Definitions", () => {
  const runConstraintCode = (code: string) => {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const typedResult = typeAndDecorate(ast);
    return typedResult;
  };

  test("should parse constraint definition at top level", () => {
    const code = `constraint Show a ( show : a -> String )`;
    const result = runConstraintCode(code);
    
    expect(result.program.statements).toHaveLength(1);
    expect(result.program.statements[0].kind).toBe("constraint-definition");
    
    const constraintDef = result.program.statements[0] as any;
    expect(constraintDef.name).toBe("Show");
    expect(constraintDef.typeParam).toBe("a");
    expect(constraintDef.functions).toHaveLength(1);
    expect(constraintDef.functions[0].name).toBe("show");
  });

  test("should parse implement definition at top level", () => {
    const code = `
      constraint Show a ( show : a -> String );
      implement Show Int ( show = toString )
    `;
    const result = runConstraintCode(code);
    
    expect(result.program.statements).toHaveLength(2);
    expect(result.program.statements[0].kind).toBe("constraint-definition");
    expect(result.program.statements[1].kind).toBe("implement-definition");
    
    const implementDef = result.program.statements[1] as any;
    expect(implementDef.constraintName).toBe("Show");
    expect(implementDef.typeName).toBe("Int");
    expect(implementDef.implementations).toHaveLength(1);
    expect(implementDef.implementations[0].name).toBe("show");
  });

  test("should resolve constraint functions from implementations", () => {
    const code = `
      constraint Show a ( show : a -> String );
      implement Show Int ( show = toString );
      x = show 42
    `;
    const result = runConstraintCode(code);
    
    expect(result.program.statements).toHaveLength(3);
    expect(result.program.statements[0].kind).toBe("constraint-definition");
    expect(result.program.statements[1].kind).toBe("implement-definition");
    expect(result.program.statements[2].kind).toBe("definition");
    
    const definition = result.program.statements[2] as any;
    expect(definition.name).toBe("x");
  });

  test("should support multiple constraint functions", () => {
    const code = `
      constraint Eq a ( 
        equals : a -> a -> Bool; 
        notEquals : a -> a -> Bool 
      );
      implement Eq Int ( 
        equals = fn a b => a == b;
        notEquals = fn a b => a != b
      );
      result = equals 1 2
    `;
    const result = runConstraintCode(code);
    
    expect(result.program.statements).toHaveLength(3);
    expect(result.program.statements[0].kind).toBe("constraint-definition");
    expect(result.program.statements[1].kind).toBe("implement-definition");
    expect(result.program.statements[2].kind).toBe("definition");
    
    const constraintDef = result.program.statements[0] as any;
    expect(constraintDef.functions).toHaveLength(2);
    expect(constraintDef.functions[0].name).toBe("equals");
    expect(constraintDef.functions[1].name).toBe("notEquals");
    
    const implementDef = result.program.statements[1] as any;
    expect(implementDef.implementations).toHaveLength(2);
    expect(implementDef.implementations[0].name).toBe("equals");
    expect(implementDef.implementations[1].name).toBe("notEquals");
  });
});