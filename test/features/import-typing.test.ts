import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { runCode, expectSuccess, parseAndType } from '../utils';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Import Type Inference', () => {
  
  const testModuleDir = path.join(process.cwd(), 'temp_test_modules');
  
  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testModuleDir)) {
      fs.mkdirSync(testModuleDir, { recursive: true });
    }
  });
  
  afterAll(() => {
    // Clean up test modules
    if (fs.existsSync(testModuleDir)) {
      fs.rmSync(testModuleDir, { recursive: true, force: true });
    }
  });

  test('should infer Float type for simple numeric import', () => {
    const moduleSource = '42';
    const modulePath = path.join(testModuleDir, 'simple_number.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'x = import "temp_test_modules/simple_number"; x';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('primitive');
    expect((result.type as any)?.name).toBe('Float');
  });

  test('should infer String type for simple string import', () => {
    const moduleSource = '"hello world"';
    const modulePath = path.join(testModuleDir, 'simple_string.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'x = import "temp_test_modules/simple_string"; x';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('primitive');
    expect((result.type as any)?.name).toBe('String');
  });

  test('should infer record type for record import', () => {
    const moduleSource = '{@name "Alice", @age 30}';
    const modulePath = path.join(testModuleDir, 'person_record.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'person = import "temp_test_modules/person_record"; person';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('record');
    const recordType = result.type as any;
    expect(recordType.fields).toHaveProperty('name');
    expect(recordType.fields).toHaveProperty('age');
    expect(recordType.fields.name.kind).toBe('primitive');
    expect(recordType.fields.name.name).toBe('String');
    expect(recordType.fields.age.kind).toBe('primitive');
    expect(recordType.fields.age.name).toBe('Float');
  });

  test('should infer function type for function import', () => {
    const moduleSource = 'fn x => x + 1';
    const modulePath = path.join(testModuleDir, 'increment.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'inc = import "temp_test_modules/increment"; inc';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('function');
    const funcType = result.type as any;
    expect(funcType.params).toHaveLength(1);
    expect(funcType.params[0].kind).toBe('primitive');
    expect(funcType.params[0].name).toBe('Float');
    expect(funcType.return.kind).toBe('primitive');
    expect(funcType.return.name).toBe('Float');
  });

  test('should infer record type with function fields', () => {
    const moduleSource = `
      addFn = fn x y => x + y;
      multiplyFn = fn x y => x * y;
      {@add addFn, @multiply multiplyFn}
    `;
    const modulePath = path.join(testModuleDir, 'math_functions.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'math = import "temp_test_modules/math_functions"; math';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('record');
    const recordType = result.type as any;
    expect(recordType.fields).toHaveProperty('add');
    expect(recordType.fields).toHaveProperty('multiply');
    expect(recordType.fields.add.kind).toBe('function');
    expect(recordType.fields.multiply.kind).toBe('function');
  });

  test('should infer list type for list import', () => {
    const moduleSource = '[1, 2, 3, 4, 5]';
    const modulePath = path.join(testModuleDir, 'number_list.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'numbers = import "temp_test_modules/number_list"; numbers';
    const result = parseAndType(source);
    
    expect(result.type?.kind).toBe('list');
    const listType = result.type as any;
    expect(listType.element.kind).toBe('primitive');
    expect(listType.element.name).toBe('Float');
  });

  test('should work with destructuring on properly typed imports', () => {
    const moduleSource = `
      squareFn = fn x => x * x;
      cubeFn = fn x => x * x * x;
      {@square squareFn, @cube cubeFn}
    `;
    const modulePath = path.join(testModuleDir, 'power_functions.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = '{@square, @cube} = import "temp_test_modules/power_functions"; square 4 + cube 2';
    const result = runCode(source);
    
    expect(result.finalValue).toBe(24); // 4² + 2³ = 16 + 8 = 24
  });

  test('should preserve type information through simple chain', () => {
    // Create a simple module that exports a function
    const moduleSource = 'fn x => x * 2';
    const modulePath = path.join(testModuleDir, 'doubler.noo');
    fs.writeFileSync(modulePath, moduleSource);
    
    const source = 'doubler = import "temp_test_modules/doubler"; doubler 5';
    const result = runCode(source);
    
    expect(result.finalValue).toBe(10); // 5 * 2 = 10
  });

});