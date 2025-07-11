import {
  Expression,
  Program,
  Definition,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
} from './ast';

export type Value = 
  | number
  | string
  | boolean
  | any[]
  | Function
  | { kind: 'native'; name: string; fn: (...args: Value[]) => Value };

export type Environment = Map<string, Value>;

export class Evaluator {
  private environment: Environment;

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
  }

  private initializeBuiltins(): void {
    // Arithmetic operations
    this.environment.set('+', {
      kind: 'native',
      name: '+',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a + b;
        }
        throw new Error(`Cannot add ${typeof a} and ${typeof b}`);
      },
    });

    this.environment.set('-', {
      kind: 'native',
      name: '-',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
        }
        throw new Error(`Cannot subtract ${typeof b} from ${typeof a}`);
      },
    });

    this.environment.set('*', {
      kind: 'native',
      name: '*',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a * b;
        }
        throw new Error(`Cannot multiply ${typeof a} and ${typeof b}`);
      },
    });

    this.environment.set('/', {
      kind: 'native',
      name: '/',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) throw new Error('Division by zero');
          return a / b;
        }
        throw new Error(`Cannot divide ${typeof a} by ${typeof b}`);
      },
    });

    // Comparison operations
    this.environment.set('==', {
      kind: 'native',
      name: '==',
      fn: (a: Value, b: Value) => a === b,
    });

    this.environment.set('!=', {
      kind: 'native',
      name: '!=',
      fn: (a: Value, b: Value) => a !== b,
    });

    this.environment.set('<', {
      kind: 'native',
      name: '<',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a < b;
        }
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      },
    });

    this.environment.set('>', {
      kind: 'native',
      name: '>',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a > b;
        }
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      },
    });

    this.environment.set('<=', {
      kind: 'native',
      name: '<=',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a <= b;
        }
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      },
    });

    this.environment.set('>=', {
      kind: 'native',
      name: '>=',
      fn: (a: Value, b: Value) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a >= b;
        }
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      },
    });

    // List operations
    this.environment.set('head', {
      kind: 'native',
      name: 'head',
      fn: (list: Value) => {
        if (Array.isArray(list) && list.length > 0) {
          return list[0];
        }
        throw new Error('Cannot get head of empty list or non-list');
      },
    });

    this.environment.set('tail', {
      kind: 'native',
      name: 'tail',
      fn: (list: Value) => {
        if (Array.isArray(list) && list.length > 0) {
          return list.slice(1);
        }
        throw new Error('Cannot get tail of empty list or non-list');
      },
    });

    this.environment.set('cons', {
      kind: 'native',
      name: 'cons',
      fn: (head: Value, tail: Value) => {
        if (Array.isArray(tail)) {
          return [head, ...tail];
        }
        throw new Error('Second argument to cons must be a list');
      },
    });

    // Utility functions
    this.environment.set('print', {
      kind: 'native',
      name: 'print',
      fn: (value: Value) => {
        console.log(this.valueToString(value));
        return value;
      },
    });
  }

  evaluateProgram(program: Program): Value[] {
    const results: Value[] = [];
    
    for (const statement of program.statements) {
      if (statement.kind === 'definition') {
        this.evaluateDefinition(statement);
      } else {
        results.push(this.evaluateExpression(statement));
      }
    }
    
    return results;
  }

  private evaluateDefinition(def: Definition): void {
    const value = this.evaluateExpression(def.value);
    this.environment.set(def.name, value);
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
      

      
      default:
        throw new Error(`Unknown expression kind: ${(expr as any).kind}`);
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
    return (...args: Value[]) => {
      if (args.length !== expr.params.length) {
        throw new Error(`Expected ${expr.params.length} arguments, got ${args.length}`);
      }

      // Create new environment for function scope
      const functionEnv = new Map(this.environment);
      
      // Bind parameters
      for (let i = 0; i < expr.params.length; i++) {
        functionEnv.set(expr.params[i], args[i]);
      }

      // Create temporary evaluator with function environment
      const tempEvaluator = new Evaluator();
      tempEvaluator.environment = functionEnv;
      
      return tempEvaluator.evaluateExpression(expr.body);
    };
  }

  private evaluateApplication(expr: ApplicationExpression): Value {
    const func = this.evaluateExpression(expr.func);
    const args = expr.args.map(arg => this.evaluateExpression(arg));

    if (typeof func === 'function') {
      return func(...args);
    } else if (func && typeof func === 'object' && 'kind' in func && func.kind === 'native') {
      return (func as any).fn(...args);
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
      } else if (func && typeof func === 'object' && 'kind' in func && func.kind === 'native') {
        result = (func as any).fn(result);
      } else {
        throw new Error(`Cannot apply non-function in pipeline: ${this.valueToString(func)}`);
      }
    }
    
    return result;
  }

  private evaluateBinary(expr: BinaryExpression): Value {
    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);

    const operator = this.environment.get(expr.operator);
    if (operator && typeof operator === 'object' && 'kind' in operator && operator.kind === 'native') {
      return (operator as any).fn(left, right);
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



  private valueToString(value: Value): string {
    if (typeof value === 'function') {
      return '<function>';
    } else if (value && typeof value === 'object' && 'kind' in value && value.kind === 'native') {
      return `<native:${(value as any).name}>`;
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
} 