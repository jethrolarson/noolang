import { Parser } from '../src/parser';

describe('Parser', () => {
  test('should parse simple literals', () => {
    const parser = new Parser('42');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('literal');
    expect((program.statements[0] as any).value).toBe(42);
  });

  test('should parse string literals', () => {
    const parser = new Parser('"hello"');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('literal');
    expect((program.statements[0] as any).value).toBe('hello');
  });

  test('should parse boolean literals', () => {
    const parser = new Parser('true');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('literal');
    expect((program.statements[0] as any).value).toBe(true);
  });

  test('should parse variable references', () => {
    const parser = new Parser('x');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('variable');
    expect((program.statements[0] as any).name).toBe('x');
  });

  test('should parse function definitions', () => {
    const parser = new Parser('add = fn x y => x + y;');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('definition');
    const def = program.statements[0] as any;
    expect(def.name).toBe('add');
    expect(def.value.kind).toBe('function');
    expect(def.value.params).toEqual(['x']);
  });

  test('should parse function applications', () => {
    const parser = new Parser('add 2 3');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('application');
    const app = program.statements[0] as any;
    expect(app.func.kind).toBe('application');
    expect(app.func.func.kind).toBe('variable');
    expect(app.func.func.name).toBe('add');
    expect(app.func.args).toHaveLength(1);
    expect(app.func.args[0].kind).toBe('literal');
    expect(app.func.args[0].value).toBe(2);
    expect(app.args).toHaveLength(1);
    expect(app.args[0].kind).toBe('literal');
    expect(app.args[0].value).toBe(3);
  });

  test('should parse binary expressions', () => {
    const parser = new Parser('2 + 3');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('binary');
    const binary = program.statements[0] as any;
    expect(binary.operator).toBe('+');
  });

  test('should parse lists', () => {
    const parser = new Parser('[1 2 3]');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('literal');
    const elements = (program.statements[0] as any).value;
    expect(Array.isArray(elements)).toBe(true);
    expect(elements).toHaveLength(3);
    expect(elements[0].kind).toBe('literal');
    expect(elements[0].value).toBe(1);
    expect(elements[1].value).toBe(2);
    expect(elements[2].value).toBe(3);
  });

  test('should parse if expressions', () => {
    const parser = new Parser('if true then 1 else 2');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('if');
    const ifExpr = program.statements[0] as any;
    expect(ifExpr.condition.value).toBe(true);
    expect(ifExpr.then.value).toBe(1);
    expect(ifExpr.else.value).toBe(2);
  });

  test('should parse pipeline expressions', () => {
    const parser = new Parser('[1, 2, 3] |> head');
    const program = parser.parse();
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('pipeline');
    const pipeline = program.statements[0] as any;
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0].kind).toBe('literal');
    expect(pipeline.steps[1].kind).toBe('variable');
  });
}); 