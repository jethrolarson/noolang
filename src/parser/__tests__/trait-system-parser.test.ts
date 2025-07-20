import { Lexer } from "../../lexer";
import { parse } from "../parser";
import type { 
  ConstraintDefinitionExpression, 
  ImplementDefinitionExpression, 
  Program 
} from "../../ast";

function parseTraitCode(code: string): Program {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const result = parse(tokens);
  
  if (!result.success) {
    throw new Error(`Parse error: ${result.error} at position ${result.position}`);
  }
  
  return result.value;
}

describe("Trait System Parser", () => {
  test("should parse constraint definition", () => {
    const code = `
      constraint Show a (
        show : a -> String
      );
    `;
    
    const program = parseTraitCode(code);
    expect(program.statements).toHaveLength(1);
    
    const constraint = program.statements[0] as ConstraintDefinitionExpression;
    expect(constraint.kind).toBe("constraint-definition");
    expect(constraint.name).toBe("Show");
    expect(constraint.typeParam).toBe("a");
    expect(constraint.functions).toHaveLength(1);
    expect(constraint.functions[0].name).toBe("show");
    expect(constraint.functions[0].typeParams).toEqual([]);
  });

  test("should parse constraint definition with multiple functions", () => {
    const code = `
      constraint Monad m (
        bind a b : m a -> (a -> m b) -> m b;
        pure a : a -> m a
      );
    `;
    
    const program = parseTraitCode(code);
    expect(program.statements).toHaveLength(1);
    
    const constraint = program.statements[0] as ConstraintDefinitionExpression;
    expect(constraint.kind).toBe("constraint-definition");
    expect(constraint.name).toBe("Monad");
    expect(constraint.typeParam).toBe("m");
    expect(constraint.functions).toHaveLength(2);
    
    expect(constraint.functions[0].name).toBe("bind");
    expect(constraint.functions[0].typeParams).toEqual(["a", "b"]);
    
    expect(constraint.functions[1].name).toBe("pure");
    expect(constraint.functions[1].typeParams).toEqual(["a"]);
  });

  test("should parse implement definition", () => {
    const code = `
      implement Show Int (
        show = fn x => toString x
      );
    `;
    
    const program = parseTraitCode(code);
    expect(program.statements).toHaveLength(1);
    
    const impl = program.statements[0] as ImplementDefinitionExpression;
    expect(impl.kind).toBe("implement-definition");
    expect(impl.constraintName).toBe("Show");
    expect(impl.typeName).toBe("Int");
    expect(impl.implementations).toHaveLength(1);
    expect(impl.implementations[0].name).toBe("show");
    expect(impl.implementations[0].value.kind).toBe("function");
  });

  test("should parse implement definition with multiple functions", () => {
    const code = `
      implement Monad List (
        bind = fn xs f => flatMap f xs;
        pure = fn x => [x]
      );
    `;
    
    const program = parseTraitCode(code);
    expect(program.statements).toHaveLength(1);
    
    const impl = program.statements[0] as ImplementDefinitionExpression;
    expect(impl.kind).toBe("implement-definition");
    expect(impl.constraintName).toBe("Monad");
    expect(impl.typeName).toBe("List");
    expect(impl.implementations).toHaveLength(2);
    
    expect(impl.implementations[0].name).toBe("bind");
    expect(impl.implementations[0].value.kind).toBe("function");
    
    expect(impl.implementations[1].name).toBe("pure");
    expect(impl.implementations[1].value.kind).toBe("function");
  });

  test("should parse complex constraint with function type", () => {
    const code = `
      constraint Functor f (
        map a b : (a -> b) -> f a -> f b
      );
    `;
    
    const program = parseTraitCode(code);
    const constraint = program.statements[0] as ConstraintDefinitionExpression;
    
    expect(constraint.functions[0].name).toBe("map");
    expect(constraint.functions[0].typeParams).toEqual(["a", "b"]);
    expect(constraint.functions[0].type.kind).toBe("function");
  });

  test("should parse implement with complex expression", () => {
    const code = `
      implement Monad Option (
        bind = fn opt f => match opt (
          None => None;
          Some x => f x
        )
      );
    `;
    
    const program = parseTraitCode(code);
    const impl = program.statements[0] as ImplementDefinitionExpression;
    
    expect(impl.implementations[0].name).toBe("bind");
    expect(impl.implementations[0].value.kind).toBe("function");
  });

  test("should parse multiple trait definitions in sequence", () => {
    const code = `
      constraint Show a (
        show : a -> String
      );
      
      implement Show Int (
        show = fn x => toString x
      );
      
      constraint Eq a (
        equals : a -> a -> Bool
      );
    `;
    
    const program = parseTraitCode(code);
    expect(program.statements).toHaveLength(3);
    
    expect(program.statements[0].kind).toBe("constraint-definition");
    expect(program.statements[1].kind).toBe("implement-definition");
    expect(program.statements[2].kind).toBe("constraint-definition");
  });
});