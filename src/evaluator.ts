import {
  Expression,
  Program,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
  DefinitionExpression,
  ImportExpression,
  RecordExpression,
  AccessorExpression
} from './ast';
import { createError, NoolangError } from './errors';

// Value types (Phase 6: functions and native functions as tagged union)
export type Value =
  | { tag: 'number'; value: number }
  | { tag: 'string'; value: string }
  | { tag: 'boolean'; value: boolean }
  | { tag: 'tuple'; values: Value[] }
  | { tag: 'list'; values: Value[] }
  | { tag: 'record'; fields: { [key: string]: Value } }
  | { tag: 'function'; fn: (...args: Value[]) => Value }
  | { tag: 'native'; name: string; fn: any }
  | { tag: 'unit' };

export function isNumber(value: Value): value is { tag: 'number'; value: number } {
  return value.tag === 'number';
}

export function createNumber(value: number): Value {
  return { tag: 'number', value };
}

export function isString(value: Value): value is { tag: 'string'; value: string } {
  return value.tag === 'string';
}

export function createString(value: string): Value {
  return { tag: 'string', value };
}

export function isBoolean(value: Value): value is { tag: 'boolean'; value: boolean } {
  return value.tag === 'boolean';
}

export function createBoolean(value: boolean): Value {
  return { tag: 'boolean', value };
}

export function isList(value: Value): value is { tag: 'list'; values: Value[] } {
  return value.tag === 'list';
}

export function createList(values: Value[]): Value {
  return { tag: 'list', values };
}

export function isRecord(value: Value): value is { tag: 'record'; fields: { [key: string]: Value } } {
  return value.tag === 'record';
}

export function createRecord(fields: { [key: string]: Value }): Value {
  return { tag: 'record', fields };
}

export function isFunction(value: Value): value is { tag: 'function'; fn: (...args: Value[]) => Value } {
  return value.tag === 'function';
}

export function createFunction(fn: (...args: Value[]) => Value): Value {
  return { tag: 'function', fn };
}

export function isNativeFunction(value: Value): value is { tag: 'native'; name: string; fn: (...args: Value[]) => Value } {
  return value.tag === 'native';
}

export function createNativeFunction(name: string, fn: any): Value {
  function wrap(fn: any, curriedName: string): Value {
    return { tag: 'native', name: curriedName, fn: (...args: Value[]) => {
      const result = fn(...args);
      if (typeof result === 'function') {
        return wrap(result, curriedName + '_curried');
      }
      return result;
    }};
  }
  return wrap(fn, name);
}

export function isTuple(value: Value): value is { tag: 'tuple'; values: Value[] } {
  return value.tag === 'tuple';
}

export function createTuple(values: Value[]): Value {
  return { tag: 'tuple', values };
}

export function isUnit(value: Value): value is { tag: 'unit' } {
  return value.tag === 'unit';
}

export function createUnit(): Value {
  return { tag: 'unit' };
}

export type ExecutionStep = {
  expression: string;
  result: Value;
  type?: string;
  location?: { line: number; column: number };
};

export type ProgramResult = {
  finalResult: Value;
  executionTrace: ExecutionStep[];
  environment: Map<string, Value>;
};

export type Environment = Map<string, Value>;


export class Evaluator {
  private environment: Environment;

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
  }

  private initializeBuiltins(): void {
    // Arithmetic operations
    this.environment.set('+', createNativeFunction('+', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createNumber(a.value + b.value);
      throw new Error(`Cannot add ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`);
    }));
    this.environment.set('-', createNativeFunction('-', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createNumber(a.value - b.value);
      throw new Error(`Cannot subtract ${b?.tag || 'unit'} from ${a?.tag || 'unit'}`);
    }));
    this.environment.set('*', createNativeFunction('*', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createNumber(a.value * b.value);
      throw new Error(`Cannot multiply ${a?.tag || 'unit'} and ${b?.tag || 'unit'}`);
    }));
    this.environment.set('/', createNativeFunction('/', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) {
        if (b.value === 0) {
          const error = createError(
            'RuntimeError',
            'Division by zero',
            undefined,
            `${a.value} / ${b.value}`,
            'Check that the divisor is not zero before dividing'
          );
          throw error;
        }
        return createNumber(a.value / b.value);
      }
      throw new Error(`Cannot divide ${a?.tag || 'unit'} by ${b?.tag || 'unit'}`);
    }));

    // Comparison operations
    this.environment.set('==', createNativeFunction('==', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) {
        return createBoolean(a.value === b.value);
      } else if (isString(a) && isString(b)) {
        return createBoolean(a.value === b.value);
      } else if (isBoolean(a) && isBoolean(b)) {
        return createBoolean(a.value === b.value);
      } else if (isUnit(a) && isUnit(b)) {
        return createBoolean(true);
      } else if (isUnit(a) || isUnit(b)) {
        return createBoolean(false);
      }
      return createBoolean(false);
    }));
    this.environment.set('!=', createNativeFunction('!=', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) {
        return createBoolean(a.value !== b.value);
      } else if (isString(a) && isString(b)) {
        return createBoolean(a.value !== b.value);
      } else if (isBoolean(a) && isBoolean(b)) {
        return createBoolean(a.value !== b.value);
      } else if (isUnit(a) && isUnit(b)) {
        return createBoolean(false);
      } else if (isUnit(a) || isUnit(b)) {
        return createBoolean(true);
      }
      return createBoolean(true);
    }));
    this.environment.set('<', createNativeFunction('<', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createBoolean(a.value < b.value);
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }));
    this.environment.set('>', createNativeFunction('>', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createBoolean(a.value > b.value);
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }));
    this.environment.set('<=', createNativeFunction('<=', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createBoolean(a.value <= b.value);
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }));
    this.environment.set('>=', createNativeFunction('>=', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createBoolean(a.value >= b.value);
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }));

    // Pipeline operator
    this.environment.set('|', createNativeFunction('|', (value: Value) => (func: Value) => {
      if (isFunction(func)) return func.fn(value);
      throw new Error(`Cannot apply non-function in thrush: ${func?.tag || 'unit'}`);
    }));

    // Left-to-right composition
    this.environment.set('|>', createNativeFunction('|>', (f: Value) => (g: Value) => {
      if (isFunction(f) && isFunction(g)) {
        return createFunction((x: Value) => g.fn(f.fn(x)));
      }
      throw new Error(`Cannot compose non-functions: ${f?.tag || 'unit'} and ${g?.tag || 'unit'}`);
    }));

    // Right-to-left composition
    this.environment.set('<|', createNativeFunction('<|', (f: Value) => (g: Value) => {
      if (isFunction(f) && isFunction(g)) {
        return createFunction((x: Value) => f.fn(g.fn(x)));
      }
      throw new Error(`Cannot compose non-functions: ${f?.tag || 'unit'} and ${g?.tag || 'unit'}`);
    }));

    // Semicolon operator
    this.environment.set(';', createNativeFunction(';', (left: Value) => (right: Value) => right));

    // List operations
    this.environment.set('head', createNativeFunction('head', (list: Value) => {
      if (isList(list) && list.values.length > 0) return list.values[0];
      throw new Error('Cannot get head of empty list or non-list');
    }));
    this.environment.set('tail', createNativeFunction('tail', (list: Value) => {
      if (isList(list) && list.values.length > 0) return createList(list.values.slice(1));
      throw new Error('Cannot get tail of empty list or non-list');
    }));
    this.environment.set('cons', createNativeFunction('cons', (head: Value) => (tail: Value) => {
      if (isList(tail)) return createList([head, ...tail.values]);
      throw new Error('Second argument to cons must be a list');
    }));

    // List utility functions
    this.environment.set('map', createNativeFunction('map', (func: Value) => (list: Value) => {
      if (isFunction(func) && isList(list)) {
        return createList(list.values.map((item: Value) => func.fn(item)));
      }
      throw new Error('map requires a function and a list');
    }));
    this.environment.set('filter', createNativeFunction('filter', (pred: Value) => (list: Value) => {
      if (isFunction(pred) && isList(list)) {
        return createList(list.values.filter((item: Value) => {
          const result = pred.fn(item);
          if (isBoolean(result)) {
            return result.value;
          }
          // For non-boolean results, treat as truthy/falsy
          return !isUnit(result);
        }));
      }
      throw new Error('filter requires a predicate function and a list');
    }));
    this.environment.set('reduce', createNativeFunction('reduce', (func: Value) => (initial: Value) => (list: Value) => {
      if (isFunction(func) && isList(list)) {
        return list.values.reduce((acc: Value, item: Value) => func.fn(acc, item), initial);
      }
      throw new Error('reduce requires a function, initial value, and a list');
    }));
    this.environment.set('length', createNativeFunction('length', (list: Value) => {
      if (isList(list)) return createNumber(list.values.length);
      throw new Error('length requires a list');
    }));
    this.environment.set('isEmpty', createNativeFunction('isEmpty', (list: Value) => {
      if (isList(list)) return createBoolean(list.values.length === 0);
      throw new Error('isEmpty requires a list');
    }));
    this.environment.set('append', createNativeFunction('append', (list1: Value) => (list2: Value) => {
      if (isList(list1) && isList(list2)) return createList([...list1.values, ...list2.values]);
      throw new Error('append requires two lists');
    }));

    // Math utilities
    this.environment.set('abs', createNativeFunction('abs', (n: Value) => {
      if (isNumber(n)) return createNumber(Math.abs(n.value));
      throw new Error('abs requires a number');
    }));
    this.environment.set('max', createNativeFunction('max', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createNumber(Math.max(a.value, b.value));
      throw new Error('max requires two numbers');
    }));
    this.environment.set('min', createNativeFunction('min', (a: Value) => (b: Value) => {
      if (isNumber(a) && isNumber(b)) return createNumber(Math.min(a.value, b.value));
      throw new Error('min requires two numbers');
    }));

    // Effectful functions
    this.environment.set('print', createNativeFunction('print', (value: Value) => {
      console.log(this.valueToString(value));
      return value; // Return the value that was printed
    }));

    // String utilities
    this.environment.set('concat', createNativeFunction('concat', (a: Value) => (b: Value) => {
      if (isString(a) && isString(b)) return createString(a.value + b.value);
      throw new Error('concat requires two strings');
    }));
    this.environment.set('toString', createNativeFunction('toString', (value: Value) => {
      if (isNumber(value)) {
        return createString(String(value.value));
      } else if (isString(value)) {
        return createString(value.value);
      } else if (isBoolean(value)) {
        return createString(String(value.value));
      } else if (isList(value)) {
        return createString(`[${value.values.map(v => this.valueToString(v)).join('; ')}]`);
      } else if (isTuple(value)) {
        return createString(`{${value.values.map(v => this.valueToString(v)).join('; ')}}`);
      } else if (isRecord(value)) {
        const fields = Object.entries(value.fields).map(([k, v]) => `@${k} ${this.valueToString(v)}`).join('; ');
        return createString(`{${fields}}`);
      } else if (isFunction(value)) {
        return createString(`<function>`);
      } else if (isNativeFunction(value)) {
        return createString(`<native:${value.name}>`);
      } else if (isUnit(value)) {
        return createString('unit');
      }
      return createString('[object Object]');
    }));

    // Record utilities
    this.environment.set('hasKey', createNativeFunction('hasKey', (record: Value) => (key: Value) => {
      if (isRecord(record) && isString(key)) {
        return createBoolean(key.value in record.fields);
      }
      throw new Error('hasKey requires a record and a string key');
    }));
    this.environment.set('hasValue', createNativeFunction('hasValue', (record: Value) => (value: Value) => {
      if (isRecord(record)) {
        return createBoolean(Object.values(record.fields).includes(value));
      }
      throw new Error('hasValue requires a record');
    }));
    this.environment.set('set', createNativeFunction('set', (accessor: Value) => (record: Value) => (newValue: Value) => {
      if (isNativeFunction(accessor) && isRecord(record)) {
        // For now, just handle simple field accessors
        const field = accessor.name?.replace('@', '');
        if (field) {
          return createRecord({ ...record.fields, [field]: newValue });
        }
      }
      throw new Error('set requires an accessor, record, and new value');
    }));

    // Tuple operations
    this.environment.set('tupleLength', createNativeFunction('tupleLength', (tuple: Value) => {
      if (isTuple(tuple)) {
        return createNumber(tuple.values.length);
      }
      throw new Error('tupleLength requires a tuple');
    }));

    this.environment.set('tupleToList', createNativeFunction('tupleToList', (tuple: Value) => {
      if (isTuple(tuple)) {
        return createList(tuple.values);
      }
      throw new Error('tupleToList requires a tuple');
    }));

    this.environment.set('tupleIsEmpty', createNativeFunction('tupleIsEmpty', (tuple: Value) => {
      if (isTuple(tuple)) {
        return createBoolean(tuple.values.length === 0);
      }
      throw new Error('tupleIsEmpty requires a tuple');
    }));

    this.environment.set('tupleNth', createNativeFunction('tupleNth', (index: Value) => (tuple: Value) => {
      if (isNumber(index) && isTuple(tuple)) {
        const i = index.value;
        if (i >= 0 && i < tuple.values.length) {
          return tuple.values[i];
        }
        throw new Error(`Index ${i} out of bounds for tuple of length ${tuple.values.length}`);
      }
      throw new Error('tupleNth requires a number and a tuple');
    }));

    // Restore tupleSet to curried form
    this.environment.set('tupleSet', createNativeFunction('tupleSet', (index: Value) => (tuple: Value) => (value: Value) => {
      if (isNumber(index) && isTuple(tuple)) {
        const i = index.value;
        if (i >= 0 && i < tuple.values.length) {
          const newValues = [...tuple.values];
          newValues[i] = value;
          return createTuple(newValues);
        }
        throw new Error(`Index ${i} out of bounds for tuple of length ${tuple.values.length}`);
      }
      throw new Error('tupleSet requires a number, a tuple, and a value');
    }));

    this.environment.set('tupleConcat', createNativeFunction('tupleConcat', (tuple1: Value) => (tuple2: Value) => {
      if (isTuple(tuple1) && isTuple(tuple2)) {
        return createTuple([...tuple1.values, ...tuple2.values]);
      }
      throw new Error('tupleConcat requires two tuples');
    }));
  }

  evaluateProgram(program: Program): ProgramResult {
    const executionTrace: ExecutionStep[] = [];
    
    if (program.statements.length === 0) {
      return {
        finalResult: createList([]),
        executionTrace,
        environment: new Map(this.environment)
      };
    }
    
    let finalResult: Value = createList([]);
    
    for (const statement of program.statements) {
      const result = this.evaluateExpression(statement);
      
      // Add to execution trace
      executionTrace.push({
        expression: this.expressionToString(statement),
        result: result,
        location: {
          line: statement.location.start.line,
          column: statement.location.start.column
        }
      });
      
      finalResult = result;
    }
    
    return {
      finalResult,
      executionTrace,
      environment: new Map(this.environment)
    };
  }

  private evaluateDefinition(def: DefinitionExpression): Value {
    const value = this.evaluateExpression(def.value);
    this.environment.set(def.name, value);
    return value;
  }

  evaluateExpression(expr: Expression): Value {
    switch (expr.kind) {
      case 'literal':
        return this.evaluateLiteral(expr);
      
      case 'variable':
        return this.evaluateVariable(expr);
      
      case 'function':
        return this.evaluateFunction(expr);
      
      case 'application':
        return this.evaluateApplication(expr);
      
      case 'pipeline':
        return this.evaluatePipeline(expr);
      
      case 'binary':
        return this.evaluateBinary(expr);
      
      case 'if':
        return this.evaluateIf(expr);
      
      case 'definition':
        return this.evaluateDefinition(expr);
      
      case 'import':
        return this.evaluateImport(expr);
      
      case 'record':
        return this.evaluateRecord(expr);
      
      case 'accessor':
        return this.evaluateAccessor(expr);
      
      case 'tuple': {
        // Evaluate all elements and return a tagged tuple value
        const elements = expr.elements.map(e => this.evaluateExpression(e));
        return { tag: 'tuple', values: elements };
      }
      case 'unit': {
        // Return unit value
        return createUnit();
      }
      case 'list': {
        // Evaluate all elements and return a tagged list value
        const elements = expr.elements.map(e => this.evaluateExpression(e));
        return createList(elements);
      }
      case 'tuple': {
        // Evaluate all elements and return a tagged tuple value
        const elements = expr.elements.map(e => this.evaluateExpression(e));
        return createTuple(elements);
      }
      case 'record': {
        return this.evaluateRecord(expr);
      }
      case 'if': {
        return this.evaluateIf(expr);
      }
      default:
        throw new Error(`Unknown expression kind: ${(expr as Expression).kind}`);
    }
  }

  private evaluateLiteral(expr: LiteralExpression): Value {
    if (Array.isArray(expr.value)) {
      // If it's a list, evaluate each element
      return createList(expr.value.map(element => {
        if (element && typeof element === 'object' && 'kind' in element) {
          // It's an AST node, evaluate it
          return this.evaluateExpression(element as Expression);
        } else {
          // It's already a value
          return element;
        }
      }));
    }
    
    // Convert primitive values to tagged values
    if (typeof expr.value === 'number') {
      return createNumber(expr.value);
    } else if (typeof expr.value === 'string') {
      return createString(expr.value);
    } else if (typeof expr.value === 'boolean') {
      return createBoolean(expr.value);
          } else if (expr.value === null) {
        // Handle unit literals (null in AST represents unit)
        return createUnit();
      }
    
    return expr.value;
  }

  private evaluateVariable(expr: VariableExpression): Value {
    const value = this.environment.get(expr.name);
    if (value === undefined) {
      const error = createError(
        'RuntimeError',
        `Undefined variable: ${expr.name}`,
        {
          line: expr.location.start.line,
          column: expr.location.start.column,
          start: expr.location.start.line,
          end: expr.location.end.line
        },
        expr.name,
        `Define the variable before using it: ${expr.name} = value`
      );
      throw error;
    }
    return value;
  }

  private evaluateFunction(expr: FunctionExpression): Value {
    const self = this;
    // Create a manually curried function
    function createCurriedFunction(params: string[], body: Expression, env: Environment): Value {
      // Always curry by parameter count; no zero-parameter functions in Noolang
      return createFunction((arg: Value) => {
        const newEnv = new Map(env);
        newEnv.set(params[0], arg);
        if (params.length === 1) {
          const oldEnv = self.environment;
          self.environment = newEnv;
          const result = self.evaluateExpression(body);
          self.environment = oldEnv;
          return result;
        } else {
          return createCurriedFunction(params.slice(1), body, newEnv);
        }
      });
    }
    return createCurriedFunction(expr.params, expr.body, this.environment);
  }

  private evaluateApplication(expr: ApplicationExpression): Value {
    const func = this.evaluateExpression(expr.func);
    
    // Only apply the function to the arguments present in the AST
    const args = expr.args;

    if (isFunction(func)) {
      // Handle tagged function application
      let result: any = func.fn;
      
      for (const argExpr of args) {
        const arg = this.evaluateExpression(argExpr);
        if (typeof result === 'function') {
          result = result(arg);
        } else {
          throw new Error(`Cannot apply argument to non-function: ${typeof result}`);
        }
      }
      
      return result;
    } else if (isNativeFunction(func)) {
      // Handle native function application
      let result: any = func.fn;
      
      for (const argExpr of args) {
        const arg = this.evaluateExpression(argExpr);
        if (typeof result === 'function') {
          result = result(arg);
        } else if (isFunction(result)) {
          result = result.fn(arg);
        } else if (isNativeFunction(result)) {
          result = result.fn(arg);
        } else {
          throw new Error(`Cannot apply argument to non-function: ${typeof result}`);
        }
      }
      
      return result;
    } else {
      throw new Error(`Cannot apply non-function: ${typeof func} (${func?.tag || 'unknown'})`);
    }
  }

  private evaluatePipeline(expr: PipelineExpression): Value {
    let result = this.evaluateExpression(expr.steps[0]);
    
    for (let i = 1; i < expr.steps.length; i++) {
      const func = this.evaluateExpression(expr.steps[i]);
      
      if (isFunction(func)) {
        result = func.fn(result);
      } else if (isNativeFunction(func)) {
        result = func.fn(result);
      } else {
        throw new Error(`Cannot apply non-function in pipeline: ${this.valueToString(func)}`);
      }
    }
    
    return result;
  }

  private evaluateBinary(expr: BinaryExpression): Value {
    if (expr.operator === ';') {
      // Handle semicolon operator (sequence)
      // Evaluate left expression and discard result
      this.evaluateExpression(expr.left);
      // Evaluate and return right expression
      return this.evaluateExpression(expr.right);
    } else if (expr.operator === '|') {
      // Handle thrush operator
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);
      
      if (isFunction(right)) {
        return right.fn(left);
      } else if (isNativeFunction(right)) {
        return right.fn(left);
      } else {
        throw new Error(`Cannot apply non-function in thrush: ${this.valueToString(right)}`);
      }
    } else if (expr.operator === '|>') {
      // Handle pipeline operator (apply right function to left value)
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);
      
      if (isFunction(right)) {
        return right.fn(left);
      } else if (isNativeFunction(right)) {
        return right.fn(left);
      } else {
        throw new Error(`Cannot apply non-function in pipeline: ${this.valueToString(right)}`);
      }
    } else if (expr.operator === '<|') {
      // Handle right-to-left composition operator
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);
      
      if (isFunction(left) && isFunction(right)) {
        // Right-to-left: f(g(x))
        return createFunction((x: Value) => left.fn(right.fn(x)));
      } else if (isNativeFunction(left) && isNativeFunction(right)) {
        // Right-to-left: f(g(x))
        return createFunction((x: Value) => left.fn(right.fn(x)));
      } else {
        throw new Error(`Cannot compose non-functions: ${this.valueToString(left)} and ${this.valueToString(right)}`);
      }
    }

    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);

    const operator = this.environment.get(expr.operator);
    if (operator && isNativeFunction(operator)) {
      const fn: any = operator.fn(left);
      if (typeof fn === 'function') {
        return fn(right);
      } else if (isFunction(fn)) {
        return fn.fn(right);
      } else if (isNativeFunction(fn)) {
        return fn.fn(right);
      }
      throw new Error(`Operator ${expr.operator} did not return a function`);
    }

    throw new Error(`Unknown operator: ${expr.operator}`);
  }

  private evaluateIf(expr: IfExpression): Value {
    const condition = this.evaluateExpression(expr.condition);
    
    // Check if condition is truthy - handle tagged boolean values
    let isTruthy = false;
    if (isBoolean(condition)) {
      isTruthy = condition.value;
    } else if (isNumber(condition)) {
      isTruthy = condition.value !== 0;
    } else if (isString(condition)) {
      isTruthy = condition.value !== '';
    } else if (isUnit(condition)) {
      isTruthy = true;
    } else {
      // For other types (functions, lists, records), consider them truthy
      isTruthy = true;
    }
    
    if (isTruthy) {
      return this.evaluateExpression(expr.then);
    } else {
      return this.evaluateExpression(expr.else);
    }
  }

  private evaluateImport(expr: ImportExpression): Value {
    // Load and evaluate the imported file
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Resolve the file path (for now, assume .noo extension)
      const filePath = expr.path.endsWith('.noo') ? expr.path : `${expr.path}.noo`;
      const fullPath = path.resolve(filePath);
      
      // Read the file content
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Parse and evaluate the file
      const { Lexer } = require('./lexer');
      const { parse } = require('./parser/parser');
      
      const lexer = new Lexer(content);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      // Evaluate the program and return the final result
      const tempEvaluator = new Evaluator();
      const result = tempEvaluator.evaluateProgram(program);
      
      return result.finalResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const structuredError = createError(
        'ImportError',
        `Failed to import '${expr.path}': ${errorMessage}`,
        {
          line: expr.location.start.line,
          column: expr.location.start.column,
          start: expr.location.start.line,
          end: expr.location.end.line
        },
        `import "${expr.path}"`,
        'Check that the file exists and can be parsed'
      );
      throw structuredError;
    }
  }

  private evaluateRecord(expr: RecordExpression): Value {
    const record: { [key: string]: Value } = {};
    for (const field of expr.fields) {
      record[field.name] = this.evaluateExpression(field.value);
    }
    return createRecord(record);
  }

  private evaluateAccessor(expr: AccessorExpression): Value {
    // Return a function that takes a record and returns the field value
    return createNativeFunction(`@${expr.field}`, (record: Value): Value => {
      if (isRecord(record)) {
        const field = expr.field;
        if (field in record.fields) {
          return record.fields[field];
        }
      }
      throw new Error(`Field '${expr.field}' not found in record`);
    });
  }


  private valueToString(value: Value): string {
    if (typeof value === 'function') {
      return '<function>';
    } else if (isNativeFunction(value)) {
      return `<native:${value.name}>`;
    } else if (isList(value)) {
      return `[${value.values.map(this.valueToString).join(', ')}]`;
    } else if (isRecord(value)) {
      return `{ ${Object.entries(value.fields).map(([key, val]) => `${key} = ${this.valueToString(val)}`).join(', ')} }`;
    } else {
      return String(value);
    }
  }

  // Get the current environment (useful for debugging)
  getEnvironment(): Environment {
    return new Map(this.environment);
  }

  private expressionToString(expr: Expression): string {
    switch (expr.kind) {
      case 'literal':
        if (Array.isArray(expr.value)) {
          return `[${expr.value.map(e => this.expressionToString(e as Expression)).join(' ')}]`;
        }
        return String(expr.value);
      case 'variable':
        return expr.name;
      case 'function':
        return `fn ${expr.params.join(' ')} => ${this.expressionToString(expr.body)}`;
      case 'application':
        return `${this.expressionToString(expr.func)} ${expr.args.map(arg => this.expressionToString(arg)).join(' ')}`;
      case 'pipeline':
        return expr.steps.map(step => this.expressionToString(step)).join(' | ');
      case 'binary':
        return `${this.expressionToString(expr.left)} ${expr.operator} ${this.expressionToString(expr.right)}`;
      case 'if':
        return `if ${this.expressionToString(expr.condition)} then ${this.expressionToString(expr.then)} else ${this.expressionToString(expr.else)}`;
      case 'definition':
        return `${expr.name} = ${this.expressionToString(expr.value)}`;
      case 'import':
        return `import "${expr.path}"`;
      case 'record':
        return `{ ${expr.fields.map(field => `${field.name} = ${this.expressionToString(field.value)}`).join(', ')} }`;
      case 'accessor':
        return `@${expr.field}`;
      default:
        return 'unknown';
    }
  }
}