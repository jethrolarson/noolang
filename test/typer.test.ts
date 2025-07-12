import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Typer } from '../src/typer';
import { Type } from '../src/ast';

// Helper function to check if a type is a primitive type with a specific name
function isPrimitiveType(type: Type, name: string): boolean {
  return type.kind === 'primitive' && type.name === name;
}

describe('Typer', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  test('should infer types for number literals', () => {
    const lexer = new Lexer('42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Int')).toBe(true);
  });

  test('should infer types for string literals', () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'String')).toBe(true);
  });

  test('should infer types for boolean literals', () => {
    const lexer = new Lexer('true');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Bool')).toBe(true);
  });

  test('should infer types for arithmetic operations', () => {
    const lexer = new Lexer('2 + 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Int')).toBe(true);
  });

  test('should infer types for function definitions', () => {
    const lexer = new Lexer('fn x => x + 1');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1); // Function definition returns a value
    expect(types[0].kind).toBe('function');
  });

  test('should infer types for function applications', () => {
    const lexer = new Lexer('(fn x => x + 1) 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Int')).toBe(true);
  });

  test('should infer types for if expressions', () => {
    const lexer = new Lexer('if true then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Int')).toBe(true);
  });

  test('should infer types for list operations', () => {
    const lexer = new Lexer('[1, 2, 3] |> head');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('variable'); // head returns type variable
  });

  test('should infer types for comparison operations', () => {
    const lexer = new Lexer('2 < 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(isPrimitiveType(types[0], 'Bool')).toBe(true);
  });

  test('should handle undefined variables', () => {
    const lexer = new Lexer('undefined_var');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(() => {
      typer.typeProgram(program);
    }).toThrow('Undefined variable: undefined_var');
  });

  test('should handle type mismatches', () => {
    const lexer = new Lexer('"hello" + 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(() => {
      typer.typeProgram(program);
    }).toThrow('Left operand type mismatch');
  });

  test('should infer type for function with unit parameter', () => {
    const lexer = new Lexer('fn {} => "joe"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const types = typer.typeProgram(program);
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('function');
    if (types[0].kind === 'function') {
      // Accept either unit or type variable for the parameter
      const param = types[0].params[0];
      expect(param.kind === 'unit' || param.kind === 'variable').toBe(true);
      expect(types[0].return.kind).toBe('primitive');
      if (types[0].return.kind === 'primitive') {
        expect(types[0].return.name).toBe('String');
      } else {
        throw new Error('Expected primitive return type');
      }
    } else {
      throw new Error('Expected function type');
    }
  });
}); 