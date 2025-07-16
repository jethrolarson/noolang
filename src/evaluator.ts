import * as fs from "fs";
import * as path from "path";
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
  AccessorExpression,
  WhereExpression,
  TypeDefinitionExpression,
  MatchExpression,
  Pattern,
  MatchCase,
} from "./ast";
import { createError, NoolangError } from "./errors";
import { formatValue } from "./format";
import { Lexer } from "./lexer";
import { parse } from "./parser/parser";

// Value types (Phase 6: functions and native functions as tagged union)
export type Value =
  | { tag: "number"; value: number }
  | { tag: "string"; value: string }
  | { tag: "tuple"; values: Value[] }
  | { tag: "list"; values: Value[] }
  | { tag: "record"; fields: { [key: string]: Value } }
  | { tag: "function"; fn: (...args: Value[]) => Value }
  | { tag: "native"; name: string; fn: any }
  | { tag: "constructor"; name: string; args: Value[] }
  | { tag: "unit" };

// --- Mutable Cell type ---
export type Cell = { cell: true; value: Value };
export function isCell(val: any): val is Cell {
  return val && typeof val === "object" && val.cell === true && "value" in val;
}
export function createCell(value: Value): Cell {
  return { cell: true, value };
}

export function isNumber(
  value: Value,
): value is { tag: "number"; value: number } {
  return value.tag === "number";
}

export function createNumber(value: number): Value {
  return { tag: "number", value };
}

export function isString(
  value: Value,
): value is { tag: "string"; value: string } {
  return value.tag === "string";
}

export function createString(value: string): Value {
  return { tag: "string", value };
}

// Helper functions for Bool ADT constructors
export function createTrue(): Value {
  return { tag: "constructor", name: "True", args: [] };
}

export function createFalse(): Value {
  return { tag: "constructor", name: "False", args: [] };
}

export function createBool(value: boolean): Value {
  return createConstructor(value ? "True" : "False", []);
}

export function isBool(
  value: Value,
): value is { tag: "constructor"; name: "True" | "False"; args: [] } {
  return (
    value.tag === "constructor" &&
    (value.name === "True" || value.name === "False")
  );
}

export function boolValue(value: Value): boolean {
  if (value.tag === "constructor" && value.name === "True") return true;
  if (value.tag === "constructor" && value.name === "False") return false;
  throw new Error(`Expected Bool constructor, got ${value.tag}`);
}

export function isList(
  value: Value,
): value is { tag: "list"; values: Value[] } {
  return value.tag === "list";
}

export function createList(values: Value[]): Value {
  return { tag: "list", values };
}

export function isRecord(
  value: Value,
): value is { tag: "record"; fields: { [key: string]: Value } } {
  return value.tag === "record";
}

export function createRecord(fields: { [key: string]: Value }): Value {
  return { tag: "record", fields };
}

export function isFunction(
  value: Value,
): value is { tag: "function"; fn: (...args: Value[]) => Value } {
  return value.tag === "function";
}

export function createFunction(fn: (...args: Value[]) => Value): Value {
  return { tag: "function", fn };
}

export function isNativeFunction(
  value: Value,
): value is { tag: "native"; name: string; fn: (...args: Value[]) => Value } {
  return value.tag === "native";
}

export function createNativeFunction(name: string, fn: any): Value {
  function wrap(fn: any, curriedName: string): Value {
    return {
      tag: "native",
      name: curriedName,
      fn: (...args: Value[]) => {
        const result = fn(...args);
        if (typeof result === "function") {
          return wrap(result, curriedName + "_curried");
        }
        return result;
      },
    };
  }
  return wrap(fn, name);
}

export function isTuple(
  value: Value,
): value is { tag: "tuple"; values: Value[] } {
  return value.tag === "tuple";
}

export function createTuple(values: Value[]): Value {
  return { tag: "tuple", values };
}

export function isUnit(value: Value): value is { tag: "unit" } {
  return value.tag === "unit";
}

export function createUnit(): Value {
  return { tag: "unit" };
}

export function isConstructor(
  value: Value,
): value is { tag: "constructor"; name: string; args: Value[] } {
  return value.tag === "constructor";
}

export function createConstructor(name: string, args: Value[]): Value {
  return { tag: "constructor", name, args };
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

export type Environment = Map<string, Value | Cell>;

// Helper to flatten semicolon-separated binary expressions into individual statements
const flattenStatements = (expr: Expression): Expression[] => {
  if (expr.kind === "binary" && expr.operator === ";") {
    return [...flattenStatements(expr.left), ...flattenStatements(expr.right)];
  }
  return [expr];
};

export class Evaluator {
  public environment: Environment;
  private currentFileDir?: string; // Track the directory of the current file being evaluated

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
    this.loadStdlib();
  }

  private initializeBuiltins(): void {
    // Arithmetic operations
    this.environment.set(
      "+",
      createNativeFunction("+", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createNumber(a.value + b.value);
        throw new Error(
          `Cannot add ${a?.tag || "unit"} and ${b?.tag || "unit"}`,
        );
      }),
    );
    this.environment.set(
      "-",
      createNativeFunction("-", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createNumber(a.value - b.value);
        throw new Error(
          `Cannot subtract ${b?.tag || "unit"} from ${a?.tag || "unit"}`,
        );
      }),
    );
    this.environment.set(
      "*",
      createNativeFunction("*", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createNumber(a.value * b.value);
        throw new Error(
          `Cannot multiply ${a?.tag || "unit"} and ${b?.tag || "unit"}`,
        );
      }),
    );
    this.environment.set(
      "/",
      createNativeFunction("/", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) {
          if (b.value === 0) {
            const error = createError(
              "RuntimeError",
              "Division by zero",
              undefined,
              `${a.value} / ${b.value}`,
              "Check that the divisor is not zero before dividing",
            );
            throw error;
          }
          return createNumber(a.value / b.value);
        }
        throw new Error(
          `Cannot divide ${a?.tag || "unit"} by ${b?.tag || "unit"}`,
        );
      }),
    );

    // Comparison operations
    this.environment.set(
      "==",
      createNativeFunction("==", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) {
          return createBool(a.value === b.value);
        } else if (isString(a) && isString(b)) {
          return createBool(a.value === b.value);
        } else if (isBool(a) && isBool(b)) {
          return createBool(boolValue(a) === boolValue(b));
        } else if (isUnit(a) && isUnit(b)) {
          return createTrue();
        } else if (isUnit(a) || isUnit(b)) {
          return createFalse();
        }
        return createFalse();
      }),
    );
    this.environment.set(
      "!=",
      createNativeFunction("!=", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) {
          return createBool(a.value !== b.value);
        } else if (isString(a) && isString(b)) {
          return createBool(a.value !== b.value);
        } else if (isBool(a) && isBool(b)) {
          return createBool(boolValue(a) !== boolValue(b));
        } else if (isUnit(a) && isUnit(b)) {
          return createFalse();
        } else if (isUnit(a) || isUnit(b)) {
          return createTrue();
        }
        return createTrue();
      }),
    );
    this.environment.set(
      "<",
      createNativeFunction("<", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createBool(a.value < b.value);
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      }),
    );
    this.environment.set(
      ">",
      createNativeFunction(">", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createBool(a.value > b.value);
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      }),
    );
    this.environment.set(
      "<=",
      createNativeFunction("<=", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createBool(a.value <= b.value);
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      }),
    );
    this.environment.set(
      ">=",
      createNativeFunction(">=", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b)) return createBool(a.value >= b.value);
        throw new Error(`Cannot compare ${typeof a} and ${typeof b}`);
      }),
    );

    // Pipeline operator
    this.environment.set(
      "|",
      createNativeFunction("|", (value: Value) => (func: Value) => {
        if (isFunction(func)) return func.fn(value);
        throw new Error(
          `Cannot apply non-function in thrush: ${func?.tag || "unit"}`,
        );
      }),
    );

    // Left-to-right composition
    this.environment.set(
      "|>",
      createNativeFunction("|>", (f: Value) => (g: Value) => {
        if (isFunction(f) && isFunction(g)) {
          return createFunction((x: Value) => g.fn(f.fn(x)));
        }
        throw new Error(
          `Cannot compose non-functions: ${f?.tag || "unit"} and ${
            g?.tag || "unit"
          }`,
        );
      }),
    );

    // Right-to-left composition
    this.environment.set(
      "<|",
      createNativeFunction("<|", (f: Value) => (g: Value) => {
        if (isFunction(f) && isFunction(g)) {
          return createFunction((x: Value) => f.fn(g.fn(x)));
        }
        throw new Error(
          `Cannot compose non-functions: ${f?.tag || "unit"} and ${
            g?.tag || "unit"
          }`,
        );
      }),
    );

    // Semicolon operator
    this.environment.set(
      ";",
      createNativeFunction(";", (left: Value) => (right: Value) => right),
    );

    // Dollar operator (low precedence function application)
    this.environment.set(
      "$",
      createNativeFunction("$", (func: Value) => (arg: Value) => {
        if (isFunction(func)) return func.fn(arg);
        if (isNativeFunction(func)) return func.fn(arg);
        throw new Error(
          `Cannot apply non-function in dollar operator: ${func?.tag || "unit"}`,
        );
      }),
    );

    // List operations - minimal built-ins for self-hosted functions
    this.environment.set(
      "list_get",
      createNativeFunction("list_get", (index: Value) => (list: Value) => {
        if (isNumber(index) && isList(list)) {
          const idx = index.value;
          if (idx >= 0 && idx < list.values.length) {
            return list.values[idx];
          }
        }
        throw new Error("list_get: invalid index or not a list");
      }),
    );

    // List operations
    this.environment.set(
      "tail",
      createNativeFunction("tail", (list: Value) => {
        if (isList(list) && list.values.length > 0)
          return createList(list.values.slice(1));
        throw new Error("Cannot get tail of empty list or non-list");
      }),
    );
    this.environment.set(
      "cons",
      createNativeFunction("cons", (head: Value) => (tail: Value) => {
        if (isList(tail)) return createList([head, ...tail.values]);
        throw new Error("Second argument to cons must be a list");
      }),
    );

    // List utility functions
    this.environment.set(
      "map",
      createNativeFunction("map", (func: Value) => (list: Value) => {
        if (isFunction(func) && isList(list)) {
          return createList(list.values.map((item: Value) => func.fn(item)));
        }
        throw new Error("map requires a function and a list");
      }),
    );
    this.environment.set(
      "filter",
      createNativeFunction("filter", (pred: Value) => (list: Value) => {
        if (isFunction(pred) && isList(list)) {
          return createList(
            list.values.filter((item: Value) => {
              const result = pred.fn(item);
              if (isBool(result)) {
                return boolValue(result);
              }
              // For non-boolean results, treat as truthy/falsy
              return !isUnit(result);
            }),
          );
        }
        throw new Error("filter requires a predicate function and a list");
      }),
    );
    this.environment.set(
      "reduce",
      createNativeFunction(
        "reduce",
        (func: Value) => (initial: Value) => (list: Value) => {
          if (isFunction(func) && isList(list)) {
            return list.values.reduce(
              (acc: Value, item: Value) => func.fn(acc, item),
              initial,
            );
          }
          throw new Error(
            "reduce requires a function, initial value, and a list",
          );
        },
      ),
    );
    this.environment.set(
      "length",
      createNativeFunction("length", (list: Value) => {
        if (isList(list)) return createNumber(list.values.length);
        throw new Error("length requires a list");
      }),
    );
    this.environment.set(
      "isEmpty",
      createNativeFunction("isEmpty", (list: Value) => {
        if (isList(list)) return createBool(list.values.length === 0);
        throw new Error("isEmpty requires a list");
      }),
    );
    this.environment.set(
      "append",
      createNativeFunction("append", (list1: Value) => (list2: Value) => {
        if (isList(list1) && isList(list2))
          return createList([...list1.values, ...list2.values]);
        throw new Error("append requires two lists");
      }),
    );

    // Math utilities
    this.environment.set(
      "abs",
      createNativeFunction("abs", (n: Value) => {
        if (isNumber(n)) return createNumber(Math.abs(n.value));
        throw new Error("abs requires a number");
      }),
    );
    this.environment.set(
      "max",
      createNativeFunction("max", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b))
          return createNumber(Math.max(a.value, b.value));
        throw new Error("max requires two numbers");
      }),
    );
    this.environment.set(
      "min",
      createNativeFunction("min", (a: Value) => (b: Value) => {
        if (isNumber(a) && isNumber(b))
          return createNumber(Math.min(a.value, b.value));
        throw new Error("min requires two numbers");
      }),
    );

    // Effectful functions
    this.environment.set(
      "print",
      createNativeFunction("print", (value: Value) => {
        console.log(formatValue(value));
        return value; // Return the value that was printed
      }),
    );

    // String utilities
    this.environment.set(
      "concat",
      createNativeFunction("concat", (a: Value) => (b: Value) => {
        if (isString(a) && isString(b)) return createString(a.value + b.value);
        throw new Error("concat requires two strings");
      }),
    );
    this.environment.set(
      "toString",
      createNativeFunction("toString", (value: Value) =>
        createString(valueToString(value)),
      ),
    );

    // Record utilities
    this.environment.set(
      "hasKey",
      createNativeFunction("hasKey", (record: Value) => (key: Value) => {
        if (isRecord(record) && isString(key)) {
          return createBool(key.value in record.fields);
        }
        throw new Error("hasKey requires a record and a string key");
      }),
    );
    this.environment.set(
      "hasValue",
      createNativeFunction("hasValue", (record: Value) => (value: Value) => {
        if (isRecord(record)) {
          return createBool(Object.values(record.fields).includes(value));
        }
        throw new Error("hasValue requires a record");
      }),
    );
    this.environment.set(
      "set",
      createNativeFunction(
        "set",
        (accessor: Value) => (record: Value) => (newValue: Value) => {
          if (isNativeFunction(accessor) && isRecord(record)) {
            // For now, just handle simple field accessors
            const field = accessor.name?.replace("@", "");
            if (field) {
              return createRecord({ ...record.fields, [field]: newValue });
            }
          }
          throw new Error("set requires an accessor, record, and new value");
        },
      ),
    );

    // Tuple operations
    this.environment.set(
      "tupleLength",
      createNativeFunction("tupleLength", (tuple: Value) => {
        if (isTuple(tuple)) {
          return createNumber(tuple.values.length);
        }
        throw new Error("tupleLength requires a tuple");
      }),
    );
    this.environment.set(
      "tupleIsEmpty",
      createNativeFunction("tupleIsEmpty", (tuple: Value) => {
        if (isTuple(tuple)) {
          return createBool(tuple.values.length === 0);
        }
        throw new Error("tupleIsEmpty requires a tuple");
      }),
    );

    // Built-in ADT constructors are now self-hosted in stdlib.noo

    // Option utility functions
    this.environment.set(
      "isSome",
      createNativeFunction("isSome", (option: Value) => {
        if (isConstructor(option) && option.name === "Some") {
          return createTrue();
        } else if (isConstructor(option) && option.name === "None") {
          return createFalse();
        }
        throw new Error("isSome requires an Option value");
      }),
    );

    this.environment.set(
      "isNone",
      createNativeFunction("isNone", (option: Value) => {
        if (isConstructor(option) && option.name === "None") {
          return createTrue();
        } else if (isConstructor(option) && option.name === "Some") {
          return createFalse();
        }
        throw new Error("isNone requires an Option value");
      }),
    );

    this.environment.set(
      "unwrap",
      createNativeFunction("unwrap", (option: Value) => {
        if (
          isConstructor(option) &&
          option.name === "Some" &&
          option.args.length === 1
        ) {
          return option.args[0];
        } else if (isConstructor(option) && option.name === "None") {
          throw new Error("Cannot unwrap None value");
        }
        throw new Error("unwrap requires a Some value");
      }),
    );

    // Result utility functions
    this.environment.set(
      "isOk",
      createNativeFunction("isOk", (result: Value) => {
        if (isConstructor(result) && result.name === "Ok") {
          return createTrue();
        } else if (isConstructor(result) && result.name === "Err") {
          return createFalse();
        }
        throw new Error("isOk requires a Result value");
      }),
    );

    this.environment.set(
      "isErr",
      createNativeFunction("isErr", (result: Value) => {
        if (isConstructor(result) && result.name === "Err") {
          return createTrue();
        } else if (isConstructor(result) && result.name === "Ok") {
          return createFalse();
        }
        throw new Error("isErr requires a Result value");
      }),
    );
  }

  private loadStdlib(): void {
    try {
      // Find stdlib.noo relative to this file
      const stdlibPath = path.join(__dirname, "..", "stdlib.noo");

      const stdlibContent = fs.readFileSync(stdlibPath, "utf-8");
      const lexer = new Lexer(stdlibContent);
      const tokens = lexer.tokenize();
      const stdlibProgram = parse(tokens);

      // Flatten any semicolon-separated statements
      const allStatements: Expression[] = [];
      for (const statement of stdlibProgram.statements) {
        allStatements.push(...flattenStatements(statement));
      }

      // Evaluate stdlib statements to populate the runtime environment
      for (const statement of allStatements) {
        this.evaluateExpression(statement);
      }
    } catch (error) {
      console.warn(`Warning: Failed to load stdlib.noo:`, error);
    }
  }

  evaluateProgram(program: Program, filePath?: string): ProgramResult {
    // Set the current file directory for imports
    if (filePath) {
      const path = require("path");
      this.currentFileDir = path.dirname(path.resolve(filePath));
    }

    const executionTrace: ExecutionStep[] = [];

    if (program.statements.length === 0) {
      return {
        finalResult: createList([]),
        executionTrace,
        environment: new Map(
          Array.from(this.environment.entries()).map(([k, v]) => [
            k,
            isCell(v) ? v.value : v,
          ]),
        ),
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
          column: statement.location.start.column,
        },
      });

      finalResult = result;
    }

    return {
      finalResult,
      executionTrace,
      environment: new Map(
        Array.from(this.environment.entries()).map(([k, v]) => [
          k,
          isCell(v) ? v.value : v,
        ]),
      ),
    };
  }

  private evaluateDefinition(def: DefinitionExpression): Value {
    // Check if this definition might be recursive by looking for the name in the value
    const isRecursive = this.containsVariable(def.value, def.name);

    if (isRecursive) {
      // For recursive definitions, we need a placeholder that gets updated
      const cell = createCell(createUnit());
      this.environment.set(def.name, cell);
      const value = this.evaluateExpression(def.value);
      cell.value = value;
      return value;
    } else {
      // For non-recursive definitions, store the value directly
      const value = this.evaluateExpression(def.value);
      this.environment.set(def.name, value);
      return value;
    }
  }

  private evaluateMutableDefinition(expr: any): Value {
    // Evaluate the right-hand side
    const value = this.evaluateExpression(expr.value);
    // Store a cell in the environment
    this.environment.set(expr.name, createCell(value));
    return value;
  }

  private evaluateMutation(expr: any): Value {
    // Look up the variable in the environment
    const cell = this.environment.get(expr.target);
    if (!isCell(cell)) {
      throw new Error(`Cannot mutate non-mutable variable: ${expr.target}`);
    }
    // Evaluate the new value
    const value = this.evaluateExpression(expr.value);
    // Update the cell's value
    cell.value = value;
    return value;
  }

  evaluateExpression(expr: Expression): Value {
    switch (expr.kind) {
      case "literal":
        return this.evaluateLiteral(expr);

      case "variable":
        return this.evaluateVariable(expr);

      case "function":
        return this.evaluateFunction(expr);

      case "application":
        return this.evaluateApplication(expr);

      case "pipeline":
        return this.evaluatePipeline(expr);

      case "binary":
        return this.evaluateBinary(expr);

      case "if":
        return this.evaluateIf(expr);

      case "definition":
        return this.evaluateDefinition(expr);

      case "mutable-definition":
        return this.evaluateMutableDefinition(expr);

      case "mutation":
        return this.evaluateMutation(expr);

      case "import":
        return this.evaluateImport(expr);

      case "record":
        return this.evaluateRecord(expr);

      case "accessor":
        return this.evaluateAccessor(expr);

      case "tuple": {
        // Evaluate all elements and return a tagged tuple value
        const elements = expr.elements.map((e) => {
          let val = this.evaluateExpression(e);
          if (isCell(val)) val = val.value;
          return val;
        });
        return createTuple(elements);
      }
      case "unit": {
        // Return unit value
        return createUnit();
      }
      case "list": {
        // Evaluate all elements and return a tagged list value
        const elements = expr.elements.map((e) => {
          let val = this.evaluateExpression(e);
          if (isCell(val)) val = val.value;
          return val;
        });
        return createList(elements);
      }
      case "where": {
        return this.evaluateWhere(expr);
      }
      case "typed":
        // Type annotations are erased at runtime; just evaluate the inner expression
        return this.evaluateExpression(expr.expression);
      case "constrained":
        // Constraint annotations are erased at runtime; just evaluate the inner expression
        return this.evaluateExpression(expr.expression);
      case "type-definition":
        return this.evaluateTypeDefinition(expr as TypeDefinitionExpression);
      case "match":
        return this.evaluateMatch(expr as MatchExpression);
      default:
        throw new Error(`Unknown expression kind: ${(expr as any).kind}`);
    }
  }

  private evaluateLiteral(expr: LiteralExpression): Value {
    if (Array.isArray(expr.value)) {
      // If it's a list, evaluate each element
      return createList(
        expr.value.map((element) => {
          if (element && typeof element === "object" && "kind" in element) {
            // It's an AST node, evaluate it
            return this.evaluateExpression(element as Expression);
          } else {
            // It's already a value
            return element;
          }
        }),
      );
    }

    // Convert primitive values to tagged values
    if (typeof expr.value === "number") {
      return createNumber(expr.value);
    } else if (typeof expr.value === "string") {
      return createString(expr.value);
    } else if (expr.value === null) {
      // Handle unit literals (null in AST represents unit)
      return createUnit();
    }

    // Should not reach here anymore since we removed boolean literals
    throw new Error(`Unsupported literal value: ${expr.value}`);
  }

  private evaluateVariable(expr: VariableExpression): Value {
    const value = this.environment.get(expr.name);
    if (value === undefined) {
      const error = createError(
        "RuntimeError",
        `Undefined variable: ${expr.name}`,
        {
          line: expr.location.start.line,
          column: expr.location.start.column,
          start: expr.location.start.line,
          end: expr.location.end.line,
        },
        expr.name,
        `Define the variable before using it: ${expr.name} = value`,
      );
      throw error;
    }
    // If it's a cell, return its value
    if (isCell(value)) {
      return value.value;
    }
    return value;
  }

  private evaluateFunction(expr: FunctionExpression): Value {
    const self = this;
    // Create a closure that captures the current environment
    const closureEnv = new Map(this.environment);

    function createCurriedFunction(params: string[], body: Expression): Value {
      return createFunction((arg: Value) => {
        // Create a new environment for this function call
        const callEnv = new Map(closureEnv);

        // Set the parameter in the call environment
        const param = params[0];
        callEnv.set(param, arg);

        let result;
        if (params.length === 1) {
          // Create a temporary evaluator with the call environment
          const tempEvaluator = new Evaluator();
          tempEvaluator.environment = callEnv;
          result = tempEvaluator.evaluateExpression(body);
        } else {
          // Create a function that captures the current parameter
          const capturedParam = param;
          const capturedArg = arg;
          const remainingParams = params.slice(1);

          const nextFunction = createFunction((nextArg: Value) => {
            const nextCallEnv = new Map(callEnv);
            nextCallEnv.set(remainingParams[0], nextArg);

            if (remainingParams.length === 1) {
              const tempEvaluator = new Evaluator();
              tempEvaluator.environment = nextCallEnv;
              return tempEvaluator.evaluateExpression(body);
            } else {
              // Continue currying for remaining parameters
              const tempEvaluator = new Evaluator();
              tempEvaluator.environment = nextCallEnv;
              const remainingFunction = tempEvaluator.evaluateFunction({
                ...expr,
                params: remainingParams,
              });
              if (isFunction(remainingFunction)) {
                return remainingFunction.fn(nextArg);
              } else {
                throw new Error(
                  "Expected function but got: " + typeof remainingFunction,
                );
              }
            }
          });

          result = nextFunction;
        }

        return result;
      });
    }

    return createCurriedFunction(expr.params, expr.body);
  }

  private evaluateApplication(expr: ApplicationExpression): Value {
    const func = this.evaluateExpression(expr.func);

    // Only apply the function to the arguments present in the AST
    const args = expr.args;

    if (isFunction(func)) {
      // Handle tagged function application
      let result: any = func.fn;

      for (const argExpr of args) {
        let arg = this.evaluateExpression(argExpr);
        if (isCell(arg)) arg = arg.value;
        if (typeof result === "function") {
          result = result(arg);
        } else {
          throw new Error(
            `Cannot apply argument to non-function: ${typeof result}`,
          );
        }
      }

      return result;
    } else if (isNativeFunction(func)) {
      // Handle native function application
      let result: any = func.fn;

      for (const argExpr of args) {
        let arg = this.evaluateExpression(argExpr);
        if (isCell(arg)) arg = arg.value;
        if (typeof result === "function") {
          result = result(arg);
        } else if (isFunction(result)) {
          result = result.fn(arg);
        } else if (isNativeFunction(result)) {
          result = result.fn(arg);
        } else {
          throw new Error(
            `Cannot apply argument to non-function: ${typeof result}`,
          );
        }
      }

      return result;
    } else {
      throw new Error(
        `Cannot apply non-function: ${typeof func} (${func?.tag || "unknown"})`,
      );
    }
  }

  private evaluatePipeline(expr: PipelineExpression): Value {
    // Pipeline should be function composition, not function application
    // For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))

    if (expr.steps.length === 1) {
      return this.evaluateExpression(expr.steps[0]);
    }

    // Start with the first function
    let composed = this.evaluateExpression(expr.steps[0]);

    // Compose with each subsequent function
    for (let i = 1; i < expr.steps.length; i++) {
      const nextFunc = this.evaluateExpression(expr.steps[i]);

      if (isFunction(composed) && isFunction(nextFunc)) {
        // Compose: nextFunc(composed(x))
        const composedFn = composed as {
          tag: "function";
          fn: (...args: Value[]) => Value;
        };
        const nextFuncFn = nextFunc as {
          tag: "function";
          fn: (...args: Value[]) => Value;
        };
        composed = createFunction((x: Value) =>
          nextFuncFn.fn(composedFn.fn(x)),
        );
      } else if (isNativeFunction(composed) && isNativeFunction(nextFunc)) {
        // Compose: nextFunc(composed(x))
        const composedFn = composed as {
          tag: "native";
          name: string;
          fn: (...args: Value[]) => Value;
        };
        const nextFuncFn = nextFunc as {
          tag: "native";
          name: string;
          fn: (...args: Value[]) => Value;
        };
        composed = createFunction((x: Value) =>
          nextFuncFn.fn(composedFn.fn(x)),
        );
      } else if (isFunction(composed) && isNativeFunction(nextFunc)) {
        // Compose: nextFunc(composed(x))
        const composedFn = composed as {
          tag: "function";
          fn: (...args: Value[]) => Value;
        };
        const nextFuncFn = nextFunc as {
          tag: "native";
          name: string;
          fn: (...args: Value[]) => Value;
        };
        composed = createFunction((x: Value) =>
          nextFuncFn.fn(composedFn.fn(x)),
        );
      } else if (isNativeFunction(composed) && isFunction(nextFunc)) {
        // Compose: nextFunc(composed(x))
        const composedFn = composed as {
          tag: "native";
          name: string;
          fn: (...args: Value[]) => Value;
        };
        const nextFuncFn = nextFunc as {
          tag: "function";
          fn: (...args: Value[]) => Value;
        };
        composed = createFunction((x: Value) =>
          nextFuncFn.fn(composedFn.fn(x)),
        );
      } else {
        throw new Error(
          `Cannot compose non-functions in pipeline: ${valueToString(
            composed,
          )} and ${valueToString(nextFunc)}`,
        );
      }
    }

    return composed;
  }

  private evaluateBinary(expr: BinaryExpression): Value {
    if (expr.operator === ";") {
      // Handle semicolon operator (sequence)
      // Evaluate left expression and discard result
      this.evaluateExpression(expr.left);
      // Evaluate and return right expression
      return this.evaluateExpression(expr.right);
    } else if (expr.operator === "|") {
      // Handle thrush operator
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);

      if (isFunction(right)) {
        return right.fn(left);
      } else if (isNativeFunction(right)) {
        return right.fn(left);
      } else {
        throw new Error(
          `Cannot apply non-function in thrush: ${valueToString(right)}`,
        );
      }
    } else if (expr.operator === "$") {
      // Handle dollar operator (low precedence function application)
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);

      if (isFunction(left)) {
        return left.fn(right);
      } else if (isNativeFunction(left)) {
        return left.fn(right);
      } else {
        throw new Error(
          `Cannot apply non-function in dollar operator: ${valueToString(left)}`,
        );
      }
    } else if (expr.operator === "|>") {
      // Handle pipeline operator (left-to-right composition)
      const left = this.evaluateExpression(expr.left);
      const right = this.evaluateExpression(expr.right);

      if (isFunction(left) && isFunction(right)) {
        // Left-to-right composition: g(f(x))
        return createFunction((x: Value) => right.fn(left.fn(x)));
      } else if (isNativeFunction(left) && isNativeFunction(right)) {
        // Left-to-right composition: g(f(x))
        return createFunction((x: Value) => right.fn(left.fn(x)));
      } else if (isFunction(left) && isNativeFunction(right)) {
        // Left-to-right composition: g(f(x))
        return createFunction((x: Value) => right.fn(left.fn(x)));
      } else if (isNativeFunction(left) && isFunction(right)) {
        // Left-to-right composition: g(f(x))
        return createFunction((x: Value) => right.fn(left.fn(x)));
      } else {
        throw new Error(
          `Cannot compose non-functions in pipeline: ${valueToString(
            left,
          )} and ${valueToString(right)}`,
        );
      }
    } else if (expr.operator === "<|") {
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
        throw new Error(
          `Cannot compose non-functions: ${valueToString(
            left,
          )} and ${valueToString(right)}`,
        );
      }
    }

    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);
    const leftVal = isCell(left) ? left.value : left;
    const rightVal = isCell(right) ? right.value : right;

    const operator = this.environment.get(expr.operator);
    const operatorVal = isCell(operator) ? operator.value : operator;
    if (operatorVal && isNativeFunction(operatorVal)) {
      const fn: any = operatorVal.fn(leftVal);
      if (typeof fn === "function") {
        return fn(rightVal);
      } else if (isFunction(fn)) {
        return fn.fn(rightVal);
      } else if (isNativeFunction(fn)) {
        return fn.fn(rightVal);
      }
      throw new Error(`Operator ${expr.operator} did not return a function`);
    }

    throw new Error(`Unknown operator: ${expr.operator}`);
  }

  private evaluateIf(expr: IfExpression): Value {
    const condition = this.evaluateExpression(expr.condition);

    // Check if condition is truthy - handle tagged boolean values
    let isTruthy = false;
    if (isBool(condition)) {
      isTruthy = boolValue(condition);
    } else if (isNumber(condition)) {
      isTruthy = condition.value !== 0;
    } else if (isString(condition)) {
      isTruthy = condition.value !== "";
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
    const fs = require("fs");
    const path = require("path");

    try {
      // Resolve the file path relative to the importing file's directory
      const filePath = expr.path.endsWith(".noo")
        ? expr.path
        : `${expr.path}.noo`;

      let fullPath: string;
      if (path.isAbsolute(filePath)) {
        // Absolute path - use as is
        fullPath = filePath;
      } else if (this.currentFileDir) {
        // File-relative path - resolve relative to importing file's directory
        fullPath = path.resolve(this.currentFileDir, filePath);
      } else {
        // No current file directory - fall back to current working directory
        fullPath = path.resolve(filePath);
      }

      const cwd = process.cwd();

      // Read the file content
      const content = fs.readFileSync(fullPath, "utf8");

      // Parse and evaluate the file
      const { Lexer } = require("./lexer");
      const { parse } = require("./parser/parser");

      const lexer = new Lexer(content);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      // Evaluate the program and return the final result
      const tempEvaluator = new Evaluator();
      const result = tempEvaluator.evaluateProgram(program, fullPath);

      return result.finalResult;
    } catch (error) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack) {
          errorMessage += "\nStack trace:\n" + error.stack;
        }
      } else if (typeof error === "object") {
        try {
          errorMessage = JSON.stringify(error, null, 2);
        } catch (e) {
          errorMessage = String(error);
        }
      } else {
        errorMessage = String(error);
      }

      const path = require("path");
      const cwd = process.cwd();
      const filePath = expr.path.endsWith(".noo")
        ? expr.path
        : `${expr.path}.noo`;

      let fullPath: string;
      if (path.isAbsolute(filePath)) {
        fullPath = filePath;
      } else if (this.currentFileDir) {
        fullPath = path.resolve(this.currentFileDir, filePath);
      } else {
        fullPath = path.resolve(filePath);
      }

      const structuredError = createError(
        "ImportError",
        `Failed to import '${
          expr.path
        }': ${errorMessage}\n  Tried to resolve: ${fullPath}\n  Current working directory: ${cwd}\n  Importing file directory: ${
          this.currentFileDir || "unknown"
        }\n  Suggestion: Use a path relative to the importing file, e.g., 'math_functions' or '../std/math'`,
        {
          line: expr.location.start.line,
          column: expr.location.start.column,
          start: expr.location.start.line,
          end: expr.location.end.line,
        },
        `import "${expr.path}"`,
        "Check that the file exists and can be parsed, and that the path is correct relative to the importing file.",
      );
      throw structuredError;
    }
  }

  private evaluateRecord(expr: RecordExpression): Value {
    const record: { [key: string]: Value } = {};
    for (const field of expr.fields) {
      let val = this.evaluateExpression(field.value);
      if (isCell(val)) val = val.value;
      record[field.name] = val;
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

  private evaluateWhere(expr: any): Value {
    // Create a new environment with the where-clause definitions
    const whereEnv = new Map(this.environment);

    // Evaluate all definitions in the where clause
    for (const def of expr.definitions) {
      if (def.kind === "definition") {
        const value = this.evaluateExpression(def.value);
        whereEnv.set(def.name, value);
      } else if (def.kind === "mutable-definition") {
        const value = this.evaluateExpression(def.value);
        whereEnv.set(def.name, createCell(value));
      }
    }

    // Save the current environment
    const oldEnv = this.environment;

    // Switch to the where environment
    this.environment = whereEnv;

    // Evaluate the main expression
    const result = this.evaluateExpression(expr.main);

    // Restore the original environment
    this.environment = oldEnv;

    return result;
  }

  private containsVariable(expr: Expression, varName: string): boolean {
    switch (expr.kind) {
      case "variable":
        return expr.name === varName;
      case "function":
        // Don't check function parameters
        return this.containsVariable(expr.body, varName);
      case "application":
        return (
          this.containsVariable(expr.func, varName) ||
          expr.args.some((arg) => this.containsVariable(arg, varName))
        );
      case "binary":
        return (
          this.containsVariable(expr.left, varName) ||
          this.containsVariable(expr.right, varName)
        );
      case "if":
        return (
          this.containsVariable(expr.condition, varName) ||
          this.containsVariable(expr.then, varName) ||
          this.containsVariable(expr.else, varName)
        );
      case "definition":
        return this.containsVariable(expr.value, varName);
      case "mutable-definition":
        return this.containsVariable(expr.value, varName);
      case "mutation":
        return (
          expr.target === varName || this.containsVariable(expr.value, varName)
        );
      case "record":
        return expr.fields.some((field) =>
          this.containsVariable(field.value, varName),
        );
      case "tuple":
        return expr.elements.some((element) =>
          this.containsVariable(element, varName),
        );
      case "list":
        return expr.elements.some((element) =>
          this.containsVariable(element, varName),
        );
      case "pipeline":
        return expr.steps.some((step) => this.containsVariable(step, varName));
      case "import":
      case "accessor":
      case "literal":
      case "unit":
      case "typed":
        return false;
      default:
        return false;
    }
  }

  // Get the current environment (useful for debugging)
  getEnvironment(): Map<string, Value> {
    return new Map(
      Array.from(this.environment.entries()).map(([k, v]) => [
        k,
        isCell(v) ? v.value : v,
      ]),
    );
  }

  private expressionToString(expr: Expression): string {
    switch (expr.kind) {
      case "literal":
        if (Array.isArray(expr.value)) {
          return `[${expr.value
            .map((e) => this.expressionToString(e as Expression))
            .join(" ")}]`;
        }
        return String(expr.value);
      case "variable":
        return expr.name;
      case "function":
        return `fn ${expr.params.join(" ")} => ${this.expressionToString(
          expr.body,
        )}`;
      case "application":
        return `${this.expressionToString(expr.func)} ${expr.args
          .map((arg) => this.expressionToString(arg))
          .join(" ")}`;
      case "pipeline":
        return expr.steps
          .map((step) => this.expressionToString(step))
          .join(" | ");
      case "binary":
        return `${this.expressionToString(expr.left)} ${
          expr.operator
        } ${this.expressionToString(expr.right)}`;
      case "if":
        return `if ${this.expressionToString(
          expr.condition,
        )} then ${this.expressionToString(
          expr.then,
        )} else ${this.expressionToString(expr.else)}`;
      case "definition":
        return `${expr.name} = ${this.expressionToString(expr.value)}`;
      case "mutable-definition":
        return `${expr.name} = ${this.expressionToString(expr.value)}`;
      case "mutation":
        return `mut ${expr.target} = ${this.expressionToString(expr.value)}`;
      case "import":
        return `import "${expr.path}"`;
      case "record":
        return `{ ${expr.fields
          .map(
            (field) =>
              `${field.name} = ${this.expressionToString(field.value)}`,
          )
          .join(", ")} }`;
      case "accessor":
        return `@${expr.field}`;
      case "where":
        return `${this.expressionToString(expr.main)} where (${expr.definitions
          .map((d) => this.expressionToString(d))
          .join("; ")})`;
      default:
        return "unknown";
    }
  }

  private evaluateTypeDefinition(expr: TypeDefinitionExpression): Value {
    // Type definitions add constructors to the environment
    for (const constructor of expr.constructors) {
      if (constructor.args.length === 0) {
        // Nullary constructor: just create the constructor value
        const constructorValue = {
          tag: "constructor",
          name: constructor.name,
          args: [],
        } as Value;
        this.environment.set(constructor.name, constructorValue);
      } else {
        // N-ary constructor: create a function that builds the constructor
        const constructorFunction = (...args: Value[]): Value => {
          if (args.length !== constructor.args.length) {
            throw new Error(
              `Constructor ${constructor.name} expects ${constructor.args.length} arguments but got ${args.length}`,
            );
          }
          return { tag: "constructor", name: constructor.name, args } as Value;
        };

        // Create a simple constructor function that collects all arguments
        const createCurriedConstructor = (arity: number, name: string) => {
          const collectArgs = (collectedArgs: Value[] = []): Value => {
            return createFunction((nextArg: Value) => {
              const newArgs = [...collectedArgs, nextArg];
              if (newArgs.length === arity) {
                return { tag: "constructor", name, args: newArgs } as Value;
              } else {
                return collectArgs(newArgs);
              }
            });
          };
          return collectArgs();
        };

        this.environment.set(
          constructor.name,
          createCurriedConstructor(constructor.args.length, constructor.name),
        );
      }
    }

    // Type definitions evaluate to unit
    return createUnit();
  }

  private evaluateMatch(expr: MatchExpression): Value {
    // Evaluate the expression being matched
    const value = this.evaluateExpression(expr.expression);

    // Try each case until one matches
    for (const matchCase of expr.cases) {
      const matchResult = this.tryMatchPattern(matchCase.pattern, value);
      if (matchResult.matched) {
        // Create new environment with pattern bindings
        const savedEnv = new Map(this.environment);

        // Add bindings to environment
        for (const [name, boundValue] of matchResult.bindings) {
          this.environment.set(name, boundValue);
        }

        try {
          // Evaluate the case expression
          const result = this.evaluateExpression(matchCase.expression);
          return result;
        } finally {
          // Restore environment
          this.environment = savedEnv;
        }
      }
    }

    throw new Error("No pattern matched in match expression");
  }

  private tryMatchPattern(
    pattern: Pattern,
    value: Value,
  ): { matched: boolean; bindings: Map<string, Value> } {
    const bindings = new Map<string, Value>();

    switch (pattern.kind) {
      case "wildcard":
        // Wildcard always matches
        return { matched: true, bindings };

      case "variable":
        // Variable always matches and binds the value
        bindings.set(pattern.name, value);
        return { matched: true, bindings };

      case "constructor": {
        // Constructor pattern only matches constructor values
        if (value.tag !== "constructor") {
          return { matched: false, bindings };
        }

        // Check constructor name
        if (value.name !== pattern.name) {
          return { matched: false, bindings };
        }

        // Check argument count
        if (pattern.args.length !== value.args.length) {
          return { matched: false, bindings };
        }

        // Match each argument
        for (let i = 0; i < pattern.args.length; i++) {
          const argMatch = this.tryMatchPattern(pattern.args[i], value.args[i]);
          if (!argMatch.matched) {
            return { matched: false, bindings };
          }

          // Merge bindings
          for (const [name, boundValue] of argMatch.bindings) {
            bindings.set(name, boundValue);
          }
        }

        return { matched: true, bindings };
      }

      case "literal": {
        // Literal pattern matches if values are equal
        let matches = false;

        if (typeof pattern.value === "number" && isNumber(value)) {
          matches = pattern.value === value.value;
        } else if (typeof pattern.value === "string" && isString(value)) {
          matches = pattern.value === value.value;
        }

        return { matched: matches, bindings };
      }

      default:
        throw new Error(
          `Unsupported pattern kind: ${(pattern as Pattern).kind}`,
        );
    }
  }
}

// Move valueToString to a standalone function
function valueToString(value: Value): string {
  if (isNumber(value)) {
    return String(value.value);
  } else if (isString(value)) {
    return '"' + value.value + '"';
  } else if (isBool(value)) {
    return boolValue(value) ? "True" : "False";
  } else if (isList(value)) {
    return `[${value.values.map(valueToString).join("; ")}]`;
  } else if (isTuple(value)) {
    return `{${value.values.map(valueToString).join("; ")}}`;
  } else if (isRecord(value)) {
    const fields = Object.entries(value.fields)
      .map(([k, v]) => `@${k} ${valueToString(v)}`)
      .join("; ");
    return `{${fields}}`;
  } else if (isFunction(value)) {
    return "<function>";
  } else if (isNativeFunction(value)) {
    return `<native:${value.name}>`;
  } else if (isConstructor(value)) {
    if (value.args.length === 0) {
      return value.name;
    } else {
      return `${value.name} ${value.args.map(valueToString).join(" ")}`;
    }
  } else if (isUnit(value)) {
    return "unit";
  }
  return "[object Object]";
}
