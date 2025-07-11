import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Expression, LiteralExpression, VariableExpression, FunctionExpression, ApplicationExpression, BinaryExpression, IfExpression, RecordExpression, AccessorExpression } from '../src/ast';

// Helper functions for type-safe testing
function assertLiteralExpression(expr: Expression): LiteralExpression {
  if (expr.kind !== 'literal') {
    throw new Error(`Expected literal expression, got ${expr.kind}`);
  }
  return expr;
}

function assertVariableExpression(expr: Expression): VariableExpression {
  if (expr.kind !== 'variable') {
    throw new Error(`Expected variable expression, got ${expr.kind}`);
  }
  return expr;
}

function assertFunctionExpression(expr: Expression): FunctionExpression {
  if (expr.kind !== 'function') {
    throw new Error(`Expected function expression, got ${expr.kind}`);
  }
  return expr;
}

function assertApplicationExpression(expr: Expression): ApplicationExpression {
  if (expr.kind !== 'application') {
    throw new Error(`Expected application expression, got ${expr.kind}`);
  }
  return expr;
}

function assertBinaryExpression(expr: Expression): BinaryExpression {
  if (expr.kind !== 'binary') {
    throw new Error(`Expected binary expression, got ${expr.kind}`);
  }
  return expr;
}

function assertIfExpression(expr: Expression): IfExpression {
  if (expr.kind !== 'if') {
    throw new Error(`Expected if expression, got ${expr.kind}`);
  }
  return expr;
}

function assertRecordExpression(expr: Expression): RecordExpression {
  if (expr.kind !== 'record') {
    throw new Error(`Expected record expression, got ${expr.kind}`);
  }
  return expr;
}

function assertAccessorExpression(expr: Expression): AccessorExpression {
  if (expr.kind !== 'accessor') {
    throw new Error(`Expected accessor expression, got ${expr.kind}`);
  }
  return expr;
}

describe('Parser', () => {
  test('should parse simple literals', () => {
    const lexer = new Lexer('42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const literal = assertLiteralExpression(program.statements[0]);
    expect(literal.value).toBe(42);
  });

  test('should parse string literals', () => {
    const lexer = new Lexer('"hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const literal = assertLiteralExpression(program.statements[0]);
    expect(literal.value).toBe('hello');
  });

  test('should parse boolean literals', () => {
    const lexer = new Lexer('true');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('literal');
    expect((program.statements[0] as any).value).toBe(true);
  });

  test('should parse variable references', () => {
    const lexer = new Lexer('x');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const variable = assertVariableExpression(program.statements[0]);
    expect(variable.name).toBe('x');
  });

  test('should parse function definitions', () => {
    const lexer = new Lexer('fn x => x + 1');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const func = assertFunctionExpression(program.statements[0]);
    expect(func.params).toEqual(['x']);
    expect(func.body.kind).toBe('binary');
  });

  test('should parse function applications', () => {
    const lexer = new Lexer('(fn x => x + 1) 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const app = assertApplicationExpression(program.statements[0]);
    expect(app.func.kind).toBe('function');
    expect(app.args).toHaveLength(1);
    const arg = assertLiteralExpression(app.args[0]);
    expect(arg.value).toBe(2);
  });

  test('should parse binary expressions', () => {
    const lexer = new Lexer('2 + 3');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const binary = assertBinaryExpression(program.statements[0]);
    expect(binary.operator).toBe('+');
  });

  test('should parse lists', () => {
    const lexer = new Lexer('[1; 2; 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
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
    const lexer = new Lexer('if true then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('if');
    const ifExpr = program.statements[0] as any;
    expect(ifExpr.condition.value).toBe(true);
    expect(ifExpr.then.value).toBe(1);
    expect(ifExpr.else.value).toBe(2);
  });

  test('should parse pipeline expressions', () => {
    const lexer = new Lexer('[1; 2; 3] |> head');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('binary');
    const pipeline = program.statements[0] as any;
    expect(pipeline.operator).toBe('|>');
    expect(pipeline.left.kind).toBe('literal');
    expect(pipeline.right.kind).toBe('variable');
  });

  test('should parse single-field record', () => {
    const lexer = new Lexer('{ @name "Alice" }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('record');
    const record = program.statements[0] as any;
    expect(record.fields).toHaveLength(1);
    expect(record.fields[0].name).toBe('name');
    expect(record.fields[0].value.kind).toBe('literal');
    expect(record.fields[0].value.value).toBe('Alice');
  });

  test('should parse multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice"; @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('record');
    const record = program.statements[0] as any;
    expect(record.fields).toHaveLength(2);
    expect(record.fields[0].name).toBe('name');
    expect(record.fields[0].value.value).toBe('Alice');
    expect(record.fields[1].name).toBe('age');
    expect(record.fields[1].value.value).toBe(30);
  });

  test('should parse multi-field record (semicolon separated)', () => {
    const lexer = new Lexer('{ @name "Alice"; @age 30 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('record');
    const record = program.statements[0] as any;
    expect(record.fields).toHaveLength(2);
    expect(record.fields[0].name).toBe('name');
    expect(record.fields[0].value.value).toBe('Alice');
    expect(record.fields[1].name).toBe('age');
    expect(record.fields[1].value.value).toBe(30);
  });

  test('should parse accessor', () => {
    const lexer = new Lexer('@name');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('accessor');
    const accessor = program.statements[0] as any;
    expect(accessor.field).toBe('name');
  });
}); 