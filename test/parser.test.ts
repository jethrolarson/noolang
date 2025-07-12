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
    const lexer = new Lexer('[1, 2, 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0].kind).toBe('list');
    const elements = (program.statements[0] as any).elements;
    expect(Array.isArray(elements)).toBe(true);
    expect(elements).toHaveLength(3);
    expect(elements[0].kind).toBe('literal');
    expect(elements[0].value).toBe(1);
    expect(elements[1].kind).toBe('literal');
    expect(elements[1].value).toBe(2);
    expect(elements[2].kind).toBe('literal');
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
    const lexer = new Lexer('[1, 2, 3] |> map');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    expect(program.statements).toHaveLength(1);
    const pipeline = program.statements[0] as any;
    expect(pipeline.operator).toBe('|>');
    expect(pipeline.left.kind).toBe('list');
    expect(pipeline.right.kind).toBe('variable');
  });

  test('should parse single-field record', () => {
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
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
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
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
    const lexer = new Lexer('{ @name "Alice", @age 30 }');
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

  test('should parse function with unit parameter', () => {
    const lexer = new Lexer('fn {} => 42');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const func = assertFunctionExpression(program.statements[0]);
    expect(func.params).toEqual(['_unit']); // Unit parameter
    expect(func.body.kind).toBe('literal');
    expect((func.body as LiteralExpression).value).toBe(42);
  });

  test('should parse deeply nested tuples in records', () => {
    const lexer = new Lexer('{ @key [1, {{{1}}}] }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    // Check the outermost record
    expect(program.statements).toHaveLength(1);
    const outer = program.statements[0];
    expect(outer.kind).toBe('record');
    const keyField = (outer as any).fields[0];
    expect(keyField.name).toBe('key');
    // Check that keyField.value is a list with two elements
    expect(keyField.value.kind).toBe('list');
    expect(keyField.value.elements).toHaveLength(2);
    // First element should be a literal
    expect(keyField.value.elements[0].kind).toBe('literal');
    expect(keyField.value.elements[0].value).toBe(1);
    // Second element should be a nested tuple structure
    let nestedTuple = keyField.value.elements[1];
    expect(nestedTuple.kind).toBe('tuple');
    // Check the nested structure: tuple -> tuple -> tuple -> literal
    for (let i = 0; i < 3; i++) {
      expect(nestedTuple.kind).toBe('tuple');
      expect(nestedTuple.elements).toHaveLength(1);
      nestedTuple = nestedTuple.elements[0];
    }
    expect(nestedTuple.kind).toBe('literal');
    expect(nestedTuple.value).toBe(1);
  });

  test('should parse records with nested lists and records', () => {
    const lexer = new Lexer('{ @key [1, { @inner [2, 3] }] }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const outer = program.statements[0];
    expect(outer.kind).toBe('record');
    const keyField = (outer as any).fields[0];
    expect(keyField.name).toBe('key');
    const list = keyField.value as any;
    expect(list.kind).toBe('list');
    expect(list.elements[0].kind).toBe('literal');
    expect(list.elements[0].value).toBe(1);
    const nestedRecord = list.elements[1];
    expect(nestedRecord.kind).toBe('record');
    const innerField = nestedRecord.fields[0];
    expect(innerField.name).toBe('inner');
    const innerList = innerField.value as any;
    expect(innerList.kind).toBe('list');
    expect(innerList.elements.map((e: any) => e.value)).toEqual([2, 3]);
  });

  test('should parse lists of records', () => {
    const lexer = new Lexer('[{ @a 1 }, { @b 2 }]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const list = program.statements[0] as any;
    expect(list.kind).toBe('list');
    expect(list.elements[0].kind).toBe('record');
    expect(list.elements[1].kind).toBe('record');
    expect(list.elements[0].fields[0].name).toBe('a');
    expect(list.elements[0].fields[0].value.value).toBe(1);
    expect(list.elements[1].fields[0].name).toBe('b');
    expect(list.elements[1].fields[0].value.value).toBe(2);
  });

  test('should parse a single tuple', () => {
    const lexer = new Lexer('{1}');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const tuple = program.statements[0] as any;
    expect(tuple.kind).toBe('tuple');
    expect(tuple.elements[0].kind).toBe('literal');
    expect(tuple.elements[0].value).toBe(1);
  });

  test('should parse a single record', () => {
    const lexer = new Lexer('{ @foo 1 }');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const record = program.statements[0] as any;
    expect(record.kind).toBe('record');
    expect(record.fields[0].name).toBe('foo');
    expect(record.fields[0].value.value).toBe(1);
  });

  test('should parse a list of literals', () => {
    const lexer = new Lexer('[1, 2]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const list = program.statements[0] as any;
    expect(list.kind).toBe('list');
    expect(list.elements[0].kind).toBe('literal');
    expect(list.elements[0].value).toBe(1);
    expect(list.elements[1].kind).toBe('literal');
    expect(list.elements[1].value).toBe(2);
  });

  test('should parse a list of tuples', () => {
    const lexer = new Lexer('[{1}, {2}]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const list = program.statements[0] as any;
    expect(list.kind).toBe('list');
    expect(list.elements[0].kind).toBe('tuple');
    expect(list.elements[0].elements[0].value).toBe(1);
    expect(list.elements[1].kind).toBe('tuple');
    expect(list.elements[1].elements[0].value).toBe(2);
  });

  test('should parse a list of records', () => {
    const lexer = new Lexer('[{ @foo 1 }, { @bar 2 }]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const list = program.statements[0] as any;
    expect(list.kind).toBe('list');
    expect(list.elements[0].kind).toBe('record');
    expect(list.elements[0].fields[0].name).toBe('foo');
    expect(list.elements[0].fields[0].value.value).toBe(1);
    expect(list.elements[1].kind).toBe('record');
    expect(list.elements[1].fields[0].name).toBe('bar');
    expect(list.elements[1].fields[0].value.value).toBe(2);
  });
}); 

describe('Top-level sequence parsing', () => {
  test('multiple definitions and final expression', () => {
    const lexer = new Lexer('a = 1; b = 2; a + b');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const seq = program.statements[0];
    expect(seq.kind).toBe('binary'); // semicolon sequence
  });

  test('multiple definitions and final record', () => {
    const code = `
      add = fn x y => x + y;
      sub = fn x y => x - y;
      math = { @add add, @sub sub };
      math
    `;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const seq = program.statements[0];
    expect(seq.kind).toBe('binary');
  });

  test('sequence with trailing semicolon', () => {
    const lexer = new Lexer('a = 1; b = 2; a + b;');
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    expect(program.statements).toHaveLength(1);
    const seq = program.statements[0];
    expect(seq.kind).toBe('binary');
  });
}); 