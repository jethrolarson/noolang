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

export type Value = 
  | number
  | string
  | boolean
  | any[]
  | { [key: string]: Value }
  | ((...args: Value[]) => Value)
  | NativeFunction;

export interface NativeFunction {
  kind: 'native';
  name: string;
  fn: (...args: Value[]) => Value;
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

// Helper function to check if a value is a native function
export function isNativeFunction(value: Value): value is NativeFunction {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'native';
}

// Helper function to check if a value is a record
export function isRecord(value: Value): value is { [key: string]: Value } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isNativeFunction(value);
}

// No longer needed - all functions are manually curried

export class Evaluator {
  private environment: Environment;

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
  }

  private initializeBuiltins(): void {
    // Arithmetic operations
    this.environment.set('+', { kind: 'native', name: '+', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      throw new Error(`Cannot add ${typeof a} and ${typeof b}`);
    }});
    this.environment.set('-', { kind: 'native', name: '-', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      throw new Error(`Cannot subtract ${typeof b} from ${typeof a}`);
    }});
    this.environment.set('*', { kind: 'native', name: '*', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a * b;
      throw new Error(`Cannot multiply ${typeof a} and ${typeof b}`);
    }});
    this.environment.set('/', { kind: 'native', name: '/', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') {
        if (b === 0) throw new Error('Division by zero');
        return a / b;
      }
      throw new Error(`Cannot divide ${typeof a} by ${typeof b}`);
    }});

    // Comparison operations
    this.environment.set('==', { kind: 'native', name: '==', fn: (a: Value) => (b: Value) => a === b });
    this.environment.set('!=', { kind: 'native', name: '!=', fn: (a: Value) => (b: Value) => a !== b });
    this.environment.set('<', { kind: 'native', name: '<', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a < b;
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }});
    this.environment.set('>', { kind: 'native', name: '>', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a > b;
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }});
    this.environment.set('<=', { kind: 'native', name: '<=', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a <= b;
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }});
    this.environment.set('>=', { kind: 'native', name: '>=', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return a >= b;
      throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
    }});

    // Pipeline operator
    this.environment.set('|', { kind: 'native', name: '|', fn: (value: Value) => (func: Value) => {
      if (typeof func === 'function') return func(value);
      throw new Error(`Cannot apply non-function in thrush: ${typeof func}`);
    }});

    // Left-to-right composition
    this.environment.set('|>', { kind: 'native', name: '|>', fn: (f: Value) => (g: Value) => {
      if (typeof f === 'function' && typeof g === 'function') {
        return (x: Value) => g(f(x));
      }
      throw new Error(`Cannot compose non-functions: ${typeof f} and ${typeof g}`);
    }});

    // Right-to-left composition
    this.environment.set('<|', { kind: 'native', name: '<|', fn: (f: Value) => (g: Value) => {
      if (typeof f === 'function' && typeof g === 'function') {
        return (x: Value) => f(g(x));
      }
      throw new Error(`Cannot compose non-functions: ${typeof f} and ${typeof g}`);
    }});

    // Semicolon operator
    this.environment.set(';', { kind: 'native', name: ';', fn: (left: Value) => (right: Value) => right });

    // List operations
    this.environment.set('head', { kind: 'native', name: 'head', fn: (list: Value) => {
      if (Array.isArray(list) && list.length > 0) return list[0];
      throw new Error('Cannot get head of empty list or non-list');
    }});
    this.environment.set('tail', { kind: 'native', name: 'tail', fn: (list: Value) => {
      if (Array.isArray(list) && list.length > 0) return list.slice(1);
      throw new Error('Cannot get tail of empty list or non-list');
    }});
    this.environment.set('cons', { kind: 'native', name: 'cons', fn: (head: Value) => (tail: Value) => {
      if (Array.isArray(tail)) return [head, ...tail];
      throw new Error('Second argument to cons must be a list');
    }});

    // Utility functions
    this.environment.set('print', { kind: 'native', name: 'print', fn: (value: Value) => {
      console.log(this.valueToString(value));
      return value;
    }});

    // List utility functions
    this.environment.set('map', { kind: 'native', name: 'map', fn: (func: Value) => (list: Value) => {
      if (typeof func === 'function' && Array.isArray(list)) {
        return list.map((item: Value) => func(item));
      }
      throw new Error('map requires a function and a list');
    }});
    this.environment.set('filter', { kind: 'native', name: 'filter', fn: (pred: Value) => (list: Value) => {
      if (typeof pred === 'function' && Array.isArray(list)) {
        return list.filter((item: Value) => pred(item));
      }
      throw new Error('filter requires a predicate function and a list');
    }});
    this.environment.set('reduce', { kind: 'native', name: 'reduce', fn: (func: Value) => (initial: Value) => (list: Value) => {
      if (typeof func === 'function' && Array.isArray(list)) {
        return list.reduce((acc: Value, item: Value) => func(acc, item), initial);
      }
      throw new Error('reduce requires a function, initial value, and a list');
    }});
    this.environment.set('length', { kind: 'native', name: 'length', fn: (list: Value) => {
      if (Array.isArray(list)) return list.length;
      throw new Error('length requires a list');
    }});
    this.environment.set('isEmpty', { kind: 'native', name: 'isEmpty', fn: (list: Value) => {
      if (Array.isArray(list)) return list.length === 0;
      throw new Error('isEmpty requires a list');
    }});
    this.environment.set('append', { kind: 'native', name: 'append', fn: (list1: Value) => (list2: Value) => {
      if (Array.isArray(list1) && Array.isArray(list2)) return [...list1, ...list2];
      throw new Error('append requires two lists');
    }});

    // Math utilities
    this.environment.set('abs', { kind: 'native', name: 'abs', fn: (n: Value) => {
      if (typeof n === 'number') return Math.abs(n);
      throw new Error('abs requires a number');
    }});
    this.environment.set('max', { kind: 'native', name: 'max', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
      throw new Error('max requires two numbers');
    }});
    this.environment.set('min', { kind: 'native', name: 'min', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'number' && typeof b === 'number') return Math.min(a, b);
      throw new Error('min requires two numbers');
    }});

    // String utilities
    this.environment.set('concat', { kind: 'native', name: 'concat', fn: (a: Value) => (b: Value) => {
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      throw new Error('concat requires two strings');
    }});
    this.environment.set('toString', { kind: 'native', name: 'toString', fn: (value: Value) => {
      return this.valueToString(value);
    }});

    // Record utilities
    this.environment.set('hasKey', { kind: 'native', name: 'hasKey', fn: (record: Value) => (key: Value) => {
      if (typeof record === 'object' && record !== null && !Array.isArray(record) && typeof key === 'string') {
        return key in record;
      }
      throw new Error('hasKey requires a record and a string key');
    }});
    this.environment.set('hasValue', { kind: 'native', name: 'hasValue', fn: (record: Value) => (value: Value) => {
      if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
        return Object.values(record).includes(value);
      }
      throw new Error('hasValue requires a record');
    }});
    this.environment.set('set', { kind: 'native', name: 'set', fn: (accessor: Value) => (record: Value) => (newValue: Value) => {
      if (isNativeFunction(accessor) && isRecord(record)) {
        // For now, just handle simple field accessors
        const field = accessor.name?.replace('@', '');
        if (field) {
          return { ...record, [field]: newValue };
        }
      }
      throw new Error('set requires an accessor, record, and new value');
    }});
  }

  evaluateProgram(program: Program): ProgramResult {
    const executionTrace: ExecutionStep[] = [];
    
    if (program.statements.length === 0) {
      return {
        finalResult: [],
        executionTrace,
        environment: new Map(this.environment)
      };
    }
    
    let finalResult: Value = [];
    
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
      
      default:
        throw new Error(`Unknown expression kind: ${(expr as Expression).kind}`);
    }
  }

  private evaluateLiteral(expr: LiteralExpression): Value {
    if (Array.isArray(expr.value)) {
      // If it's a list, evaluate each element
      return expr.value.map(element => {
        if (element && typeof element === 'object' && 'kind' in element) {
          // It's an AST node, evaluate it
          return this.evaluateExpression(element as Expression);
        } else {
          // It's already a value
          return element;
        }
      });
    }
    return expr.value;
  }

  private evaluateVariable(expr: VariableExpression): Value {
    const value = this.environment.get(expr.name);
    if (value === undefined) {
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    return value;
  }

  private evaluateFunction(expr: FunctionExpression): Value {
    const self = this;
    // Create a manually curried function
    function createCurriedFunction(params: string[], body: Expression, env: Environment): Value {
      if (params.length === 0) {
        // No more parameters, evaluate the body
        const tempEvaluator = new Evaluator();
        tempEvaluator.environment = env;
        return tempEvaluator.evaluateExpression(body);
      }
      
      // Return a function that takes the next parameter
      return (arg: Value) => {
        const newEnv = new Map(env);
        newEnv.set(params[0], arg);
        return createCurriedFunction(params.slice(1), body, newEnv);
      };
    }
    
    return createCurriedFunction(expr.params, expr.body, this.environment);
  }

  private evaluateApplication(expr: ApplicationExpression): Value {
    const func = this.evaluateExpression(expr.func);
    const args = expr.args.map(arg => this.evaluateExpression(arg));

    if (typeof func === 'function') {
      // Apply arguments one by one (curried)
      let result: any = func;
      for (const arg of args) {
        if (typeof result !== 'function') {
          throw new Error(`Cannot apply argument to non-function: ${this.valueToString(result)}`);
        }
        result = result(arg);
      }
      return result;
    } else if (isNativeFunction(func)) {
      // Apply arguments one by one (curried)
      let result: Value = func.fn;
      for (const arg of args) {
        if (typeof result !== 'function') {
          throw new Error(`Cannot apply argument to non-function: ${this.valueToString(result)}`);
        }
        result = result(arg);
      }
      return result;
    } else {
      throw new Error(`Cannot apply non-function: ${this.valueToString(func)}`);
    }
  }

  private evaluatePipeline(expr: PipelineExpression): Value {
    let result = this.evaluateExpression(expr.steps[0]);
    
    for (let i = 1; i < expr.steps.length; i++) {
      const func = this.evaluateExpression(expr.steps[i]);
      
      if (typeof func === 'function') {
        result = func(result);
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
      
      if (typeof right === 'function') {
        return right(left);
      } else if (isNativeFunction(right)) {
        return right.fn(left);
      } else {
        throw new Error(`Cannot apply non-function in thrush: ${this.valueToString(right)}`);
      }
    } else if (expr.operator === '|>') {
      // Handle pipeline operator (apply right function to left value)
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);
      
      if (typeof right === 'function') {
        return right(left);
      } else if (isNativeFunction(right)) {
        return right.fn(left);
      } else {
        throw new Error(`Cannot apply non-function in pipeline: ${this.valueToString(right)}`);
      }
    } else if (expr.operator === '<|') {
      // Handle right-to-left composition operator
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);
      
      if (typeof left === 'function' && typeof right === 'function') {
        // Right-to-left: f(g(x))
        return (x: Value) => left(right(x));
      } else if (isNativeFunction(left) && isNativeFunction(right)) {
        // Right-to-left: f(g(x))
        return (x: Value) => left.fn(right.fn(x));
      } else {
        throw new Error(`Cannot compose non-functions: ${this.valueToString(left)} and ${this.valueToString(right)}`);
      }
    }

    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);

    const operator = this.environment.get(expr.operator);
    if (operator && isNativeFunction(operator)) {
      const fn = operator.fn(left);
      if (typeof fn === 'function') {
        return fn(right);
      }
      throw new Error(`Operator ${expr.operator} did not return a function`);
    }

    throw new Error(`Unknown operator: ${expr.operator}`);
  }

  private evaluateIf(expr: IfExpression): Value {
    const condition = this.evaluateExpression(expr.condition);
    
    if (condition) {
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
      throw new Error(`Failed to import '${expr.path}': ${(error as Error).message}`);
    }
  }

  private evaluateRecord(expr: RecordExpression): Value {
    const record: { [key: string]: Value } = {};
    for (const field of expr.fields) {
      record[field.name] = this.evaluateExpression(field.value);
    }
    return record;
  }

  private evaluateAccessor(expr: AccessorExpression): Value {
    // Return a function that takes a record and returns the field value
    return {
      kind: 'native',
      name: `@${expr.field}`,
      fn: (record: Value): Value => {
        if (isRecord(record)) {
          const field = expr.field;
          if (field in record) {
            return record[field];
          }
        }
        throw new Error(`Field '${expr.field}' not found in record`);
      }
    };
  }


  private valueToString(value: Value): string {
    if (typeof value === 'function') {
      return '<function>';
    } else if (isNativeFunction(value)) {
      return `<native:${value.name}>`;
    } else if (Array.isArray(value)) {
      return `[${value.map(this.valueToString).join(', ')}]`;
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