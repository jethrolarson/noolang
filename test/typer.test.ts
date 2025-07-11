import { Parser } from '../src/parser';
import { Typer } from '../src/typer';

describe('Typer', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  test('should infer types for number literals', () => {
    const parser = new Parser('42');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Int');
  });

  test('should infer types for string literals', () => {
    const parser = new Parser('"hello"');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('String');
  });

  test('should infer types for boolean literals', () => {
    const parser = new Parser('true');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Bool');
  });

  test('should infer types for arithmetic operations', () => {
    const parser = new Parser('2 + 3');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Int');
  });

  test('should infer types for function definitions', () => {
    const parser = new Parser('add = fn x y => x + y;');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(0); // No result for definition
  });

  test('should infer types for function applications', () => {
    const parser = new Parser('add = fn x y => x + y; add 2 3');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Int');
  });

  test('should infer types for if expressions', () => {
    const parser = new Parser('if true then 1 else 2');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Int');
  });

  test('should infer types for list operations', () => {
    const parser = new Parser('[1 2 3] |> head');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('variable'); // head returns type variable
  });

  test('should infer types for comparison operations', () => {
    const parser = new Parser('2 < 3');
    const program = parser.parse();
    const types = typer.typeProgram(program);
    
    expect(types).toHaveLength(1);
    expect(types[0].kind).toBe('primitive');
    expect((types[0] as any).name).toBe('Bool');
  });

  test('should handle undefined variables', () => {
    const parser = new Parser('undefined_var');
    const program = parser.parse();
    
    expect(() => {
      typer.typeProgram(program);
    }).toThrow('Undefined variable: undefined_var');
  });

  test('should handle type mismatches', () => {
    const parser = new Parser('"hello" + 5');
    const program = parser.parse();
    
    expect(() => {
      typer.typeProgram(program);
    }).toThrow('Left operand type mismatch');
  });
}); 