import * as fs from 'fs';
import * as path from 'path';
import {
  Expression,
  Program,
  DefinitionExpression,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
  MutableDefinitionExpression,
  MutationExpression,
  ImportExpression,
  RecordExpression,
  AccessorExpression,
  ListExpression,
  TupleExpression,
  WhereExpression,
  TypedExpression,
  ConstrainedExpression,
  ConstraintExpr,
  TypeDefinitionExpression,
  MatchExpression,
  ConstructorDefinition,
  Pattern,
  MatchCase,
  Type,
  Effect,
  Constraint,
  intType,
  stringType,
  boolType,
  functionType,
  typeVariable,
  unknownType,
  unitType,
  listTypeWithElement,
  tupleType,
  recordType,
  unionType,
  constrainedTypeVariable,
  constrainedFunctionType,
  isConstraint,
  hasFieldConstraint,
  implementsConstraint,
  customConstraint,
} from "./ast";
import {
  functionApplicationError,
  undefinedVariableError,
  nonFunctionApplicationError,
  operatorTypeError,
  conditionTypeError,
  ifBranchTypeError,
  typeAnnotationError,
  listElementTypeError,
  pipelineCompositionError,
  mutationTypeError,
  unificationError,
  formatTypeError,
  createTypeError,
} from "./type-errors";
import { parse } from "./parser/parser";
import { Lexer } from "./lexer";

// Type scheme for let-polymorphism
export type TypeScheme = {
  type: Type;
  quantifiedVars: string[];
};

export type TypeEnvironment = Map<string, TypeScheme>;

// ADT registry for tracking defined algebraic data types
export type ADTRegistry = Map<string, {
  typeParams: string[];
  constructors: Map<string, Type[]>; // constructor name -> arg types
}>;

// Functional state for type inference
export type TypeState = {
  environment: TypeEnvironment;
  substitution: Map<string, Type>;
  counter: number;
  constraints: Constraint[]; // Track constraints during inference
  adtRegistry: ADTRegistry; // Track ADT definitions
};

// Type inference result
export type TypeResult = {
  type: Type;
  state: TypeState;
};

// Initialize type state
export const createTypeState = (): TypeState => ({
  environment: new Map(),
  substitution: new Map(),
  counter: 0,
  constraints: [],
  adtRegistry: new Map(),
});

// Fresh type variable generation
export const freshTypeVariable = (state: TypeState): [Type, TypeState] => {
  const newCounter = state.counter + 1;
  const newType = typeVariable(`α${newCounter}`);
  return [newType, { ...state, counter: newCounter }];
};

// Helper function to count parameters in a function type
const countFunctionParams = (type: Type): number => {
  if (type.kind !== "function") return 0;
  return type.params.length + countFunctionParams(type.return);
};

// Helper function to propagate a constraint to matching type variables in a function type
const propagateConstraintToTypeVariable = (funcType: Type, constraint: Constraint): void => {
  if (funcType.kind !== "function") return;
  
  // Apply constraint to matching type variables in parameters
  for (const param of funcType.params) {
    if (param.kind === "variable" && param.name === constraint.typeVar) {
      if (!param.constraints) {
        param.constraints = [];
      }
      // Check if this constraint is already present
      const existingConstraint = param.constraints.find(
        (c) => JSON.stringify(c) === JSON.stringify(constraint)
      );
      if (!existingConstraint) {
        param.constraints.push(constraint);
      }
    }
  }
  
  // Also apply to return type if it matches
  if (funcType.return.kind === "variable" && funcType.return.name === constraint.typeVar) {
    if (!funcType.return.constraints) {
      funcType.return.constraints = [];
    }
    const existingConstraint = funcType.return.constraints.find(
      (c) => JSON.stringify(c) === JSON.stringify(constraint)
    );
    if (!existingConstraint) {
      funcType.return.constraints.push(constraint);
    }
  }
};


// Utility: mapObject for mapping over record fields
function mapObject<T, U>(
  obj: { [k: string]: T },
  fn: (v: T, k: string) => U
): { [k: string]: U } {
  const result: { [k: string]: U } = {};
  for (const k in obj) result[k] = fn(obj[k], k);
  return result;
}

// Utility: mapSet for immutable Map updates
function mapSet<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  const copy = new Map(map);
  copy.set(key, value);
  return copy;
}

// Utility: typeError for consistent error reporting
function typeError(msg: string, context?: any): never {
  throw new Error(
    `[TypeError] ${msg}${context ? `: ${JSON.stringify(context)}` : ""}`
  );
}

// Utility: isTypeKind type guard
function isTypeKind<T extends Type["kind"]>(
  t: Type,
  kind: T
): t is Extract<Type, { kind: T }> {
  return t.kind === kind;
}

// Constraint solving functions
export const solveConstraints = (
  constraints: Constraint[],
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  let currentState = state;

  for (const constraint of constraints) {
    currentState = solveConstraint(constraint, currentState, location);
  }

  return currentState;
};

export const solveConstraint = (
  constraint: Constraint,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  switch (constraint.kind) {
    case "is":
      return solveIsConstraint(constraint, state, location);
    case "hasField":
      return solveHasFieldConstraint(constraint, state, location);
    case "implements":
      return solveImplementsConstraint(constraint, state, location);
    case "custom":
      return solveCustomConstraint(constraint, state, location);
    default:
      return state;
  }
};

const solveIsConstraint = (
  constraint: { kind: "is"; typeVar: string; constraint: string },
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  // Validate constraint name first
  validateConstraintName(constraint.constraint);
  
  const typeVar = substitute(
    typeVariable(constraint.typeVar),
    state.substitution
  );

  // If the type variable has been unified to a concrete type, check if it satisfies the constraint
  if (typeVar.kind !== "variable") {
    // Check if the concrete type satisfies the constraint
    if (!satisfiesConstraint(typeVar, constraint.constraint)) {
      throw new Error(
        formatTypeError(
          createTypeError(
            `Type ${typeToString(
              typeVar,
              state.substitution
            )} does not satisfy constraint '${constraint.constraint}'. This often occurs when trying to use a partial function (one that can fail) in an unsafe context like function composition. Consider using total functions that return Option or Result types instead.`,
            {},
            location || { line: 1, column: 1 }
          )
        )
      );
    }
  } else {
    // For type variables, we need to track the constraint for later solving
    // Add the constraint to the type variable if it doesn't already have it
    if (!typeVar.constraints) {
      typeVar.constraints = [];
    }

    // Check if this constraint is already present
    const existingConstraint = typeVar.constraints.find(
      (c) =>
        c.kind === "is" &&
        c.typeVar === constraint.typeVar &&
        c.constraint === constraint.constraint
    );

    if (!existingConstraint) {
      typeVar.constraints.push(constraint);
    }
  }

  return state;
};

const solveHasFieldConstraint = (
  constraint: {
    kind: "hasField";
    typeVar: string;
    field: string;
    fieldType: Type;
  },
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  const typeVar = substitute(
    typeVariable(constraint.typeVar),
    state.substitution
  );

  if (typeVar.kind === "record") {
    // Check if the record has the required field with the right type
    if (!(constraint.field in typeVar.fields)) {
      throw new Error(
        formatTypeError(
          createTypeError(
            `Record type missing required field '${constraint.field}'`,
            {},
            location || { line: 1, column: 1 }
          )
        )
      );
    }

    // Unify the field type
    let newState = state;
    newState = unify(
      typeVar.fields[constraint.field],
      constraint.fieldType,
      newState,
      location
    );

    return newState;
  } else if (typeVar.kind === "variable") {
    // For type variables, we'll track the constraint for later solving
    return state;
  } else {
    throw new Error(
      formatTypeError(
        createTypeError(
          `Type ${typeToString(
            typeVar,
            state.substitution
          )} cannot have fields`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  }
};

const solveImplementsConstraint = (
  constraint: { kind: "implements"; typeVar: string; interfaceName: string },
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  // For now, we'll just track the constraint
  // In a full implementation, we'd check if the type implements the interface
  return state;
};

const solveCustomConstraint = (
  constraint: {
    kind: "custom";
    typeVar: string;
    constraint: string;
    args: Type[];
  },
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  // For now, we'll just track the constraint
  // In a full implementation, we'd call the custom constraint solver
  return state;
};

// Valid constraint names
const VALID_CONSTRAINTS = new Set([
  "Number", "String", "Boolean", "Show", "List", "Record", "Function", "Eq"
]);

// Validate that a constraint name is valid
const validateConstraintName = (constraint: string): void => {
  if (!VALID_CONSTRAINTS.has(constraint)) {
    throw new Error(`Unknown constraint: ${constraint}`);
  }
};

const satisfiesConstraint = (type: Type, constraint: string): boolean => {
  switch (constraint) {
    case "Number":
      return type.kind === "primitive" && type.name === "Int";
    case "String":
      return type.kind === "primitive" && type.name === "String";
    case "Boolean":
      return type.kind === "primitive" && type.name === "Bool";
    case "Show":
      return (
        type.kind === "primitive" ||
        type.kind === "list" ||
        type.kind === "record"
      );
    case "List":
      return type.kind === "list";
    case "Record":
      return type.kind === "record";
    case "Function":
      return type.kind === "function";
    case "Eq":
      return (
        type.kind === "primitive" ||
        type.kind === "list" ||
        type.kind === "record"
      );
    default:
      return false;
  }
};


// Apply substitution to a type
export const substitute = (
  type: Type,
  substitution: Map<string, Type>
): Type => {
  switch (type.kind) {
    case "variable": {
      const sub = substitution.get(type.name);
      if (sub) {
        return substitute(sub, substitution);
      }
      return type;
    }
    case "function":
      return {
        ...type,
        params: type.params.map((param) => substitute(param, substitution)),
        return: substitute(type.return, substitution),
        constraints: type.constraints?.map((c) =>
          substituteConstraint(c, substitution)
        ),
      };
    case "list":
      return { ...type, element: substitute(type.element, substitution) };
    case "tuple":
      return {
        ...type,
        elements: type.elements.map((el) => substitute(el, substitution)),
      };
    case "record":
      return {
        ...type,
        fields: mapObject(type.fields, (v, k) => substitute(v, substitution)),
      };
    case "union":
      return {
        ...type,
        types: type.types.map((t) => substitute(t, substitution)),
      };
    case "variant":
      return {
        ...type,
        args: type.args.map((arg) => substitute(arg, substitution)),
      };
    default:
      return type;
  }
};

// Apply substitution to a constraint
export const substituteConstraint = (
  constraint: Constraint,
  substitution: Map<string, Type>
): Constraint => {
  switch (constraint.kind) {
    case "is":
      return constraint; // No substitution needed for is constraints
    case "hasField":
      return {
        ...constraint,
        fieldType: substitute(constraint.fieldType, substitution),
      };
    case "implements":
      return constraint; // No substitution needed for implements constraints
    case "custom":
      return {
        ...constraint,
        args: constraint.args.map((arg) => substitute(arg, substitution)),
      };
    default:
      return constraint;
  }
};

// Check if a type variable occurs in a type (for occurs check)
export const occursIn = (varName: string, type: Type): boolean => {
  switch (type.kind) {
    case "variable":
      return type.name === varName;
    case "function":
      return (
        type.params.some((param) => occursIn(varName, param)) ||
        occursIn(varName, type.return)
      );
    case "list":
      return occursIn(varName, type.element);
    case "tuple":
      return type.elements.some((element) => occursIn(varName, element));
    case "record":
      return Object.values(type.fields).some((fieldType) =>
        occursIn(varName, fieldType)
      );
    case "union":
      return type.types.some((t) => occursIn(varName, t));
    case "variant":
      return type.args.some((arg) => occursIn(varName, arg));
    default:
      return false;
  }
};

export const unify = (
  t1: Type,
  t2: Type,
  state: TypeState,
  location?: { line: number; column: number },
  context?: {
    reason?: string;
    operation?: string;
    hint?: string;
  }
): TypeState => {
  const s1 = substitute(t1, state.substitution);
  const s2 = substitute(t2, state.substitution);

  if (typesEqual(s1, s2)) return state;

  // Handle variables (either order)
  if (isTypeKind(s1, "variable")) return unifyVariable(s1, s2, state, location);
  if (isTypeKind(s2, "variable")) return unifyVariable(s2, s1, state, location);

  // Handle function types
  if (isTypeKind(s1, "function") && isTypeKind(s2, "function")) {
    return unifyFunction(s1, s2, state, location);
  }

  // Handle list types
  if (isTypeKind(s1, "list") && isTypeKind(s2, "list")) {
    return unifyList(s1, s2, state, location);
  }

  // Handle tuple types
  if (isTypeKind(s1, "tuple") && isTypeKind(s2, "tuple")) {
    return unifyTuple(s1, s2, state, location);
  }

  // Handle record types
  if (isTypeKind(s1, "record") && isTypeKind(s2, "record")) {
    return unifyRecord(s1, s2, state, location);
  }

  // Handle union types
  if (isTypeKind(s1, "union") && isTypeKind(s2, "union")) {
    return unifyUnion(s1, s2, state, location);
  }

  // Handle primitive types
  if (isTypeKind(s1, "primitive") && isTypeKind(s2, "primitive")) {
    return unifyPrimitive(s1, s2, state, location);
  }

  // Handle unit types
  if (isTypeKind(s1, "unit") && isTypeKind(s2, "unit")) {
    return unifyUnit(s1, s2, state, location);
  }

  // Handle variant types (ADTs like Option, Result, etc.)
  if (isTypeKind(s1, "variant") && isTypeKind(s2, "variant")) {
    return unifyVariant(s1, s2, state, location);
  }

  // If we get here, the types cannot be unified
  // Add debug info for difficult cases
  const debugContext = context || {};
  if (s1.kind === s2.kind && s1.kind === 'primitive' && (s1 as any).name === (s2 as any).name) {
    debugContext.reason = 'concrete_vs_variable';
    debugContext.hint = `Both types appear to be ${(s1 as any).name} but they are not unifying. This suggests the type equality check is failing. Type 1: ${JSON.stringify(s1)}, Type 2: ${JSON.stringify(s2)}. Check if there are extra properties or constraints causing inequality.`;
  }
  
  throw new Error(
    formatTypeError(
      unificationError(
        s1,
        s2,
        debugContext,
        location || { line: 1, column: 1 }
      )
    )
  );
};

// Check if two types are structurally equal
export const typesEqual = (t1: Type, t2: Type): boolean => {
  if (t1.kind !== t2.kind) {
    return false;
  }

  switch (t1.kind) {
    case "variable":
      return t1.name === (t2 as any).name;

    case "primitive":
      return t1.name === (t2 as any).name;

    case "function":
      const f2 = t2 as any;
      if (t1.params.length !== f2.params.length) {
        return false;
      }
      return (
        t1.params.every((param, i) => typesEqual(param, f2.params[i])) &&
        typesEqual(t1.return, f2.return)
      );

    case "list":
      return typesEqual(t1.element, (t2 as any).element);

    case "tuple":
      const t2_tuple = t2 as any;
      if (t1.elements.length !== t2_tuple.elements.length) {
        return false;
      }
      return t1.elements.every((element, i) =>
        typesEqual(element, t2_tuple.elements[i])
      );

    case "record":
      const t2_record = t2 as any;
      const keys1 = Object.keys(t1.fields);
      const keys2 = Object.keys(t2_record.fields);
      if (keys1.length !== keys2.length) {
        return false;
      }
      return keys1.every((key) =>
        typesEqual(t1.fields[key], t2_record.fields[key])
      );

    case "union":
      const t2_union = t2 as any;
      if (t1.types.length !== t2_union.types.length) {
        return false;
      }
      return t1.types.every((type, i) => typesEqual(type, t2_union.types[i]));

    case "unit":
      return true;

    case "variant":
      const t2_variant = t2 as any;
      if (t1.name !== t2_variant.name) {
        return false;
      }
      if (t1.args.length !== t2_variant.args.length) {
        return false;
      }
      return t1.args.every((arg, i) => typesEqual(arg, t2_variant.args[i]));

    default:
      return false;
  }
};

// Collect all free type variables in a type
export const freeTypeVars = (
  type: Type,
  acc: Set<string> = new Set()
): Set<string> => {
  switch (type.kind) {
    case "variable":
      acc.add(type.name);
      break;
    case "function":
      for (const param of type.params) freeTypeVars(param, acc);
      freeTypeVars(type.return, acc);
      break;
    case "list":
      freeTypeVars(type.element, acc);
      break;
    case "tuple":
      for (const el of type.elements) freeTypeVars(el, acc);
      break;
    case "record":
      Object.values(type.fields).forEach((v) => freeTypeVars(v, acc));
      break;
    case "union":
      type.types.forEach((t) => freeTypeVars(t, acc));
      break;
    case "variant":
      type.args.forEach((arg) => freeTypeVars(arg, acc));
      break;
  }
  return acc;
};

// Collect all free type variables in the environment
export const freeTypeVarsEnv = (env: TypeEnvironment): Set<string> => {
  const acc = new Set<string>();
  for (const scheme of env.values()) {
    freeTypeVars(scheme.type, acc);
  }
  return acc;
};

// Generalize a type with respect to the environment
export const generalize = (
  type: Type,
  env: TypeEnvironment,
  substitution: Map<string, Type>
): TypeScheme => {
  // Apply current substitution to the type before generalizing
  const substitutedType = substitute(type, substitution);
  const typeVars = freeTypeVars(substitutedType);
  const envVars = freeTypeVarsEnv(env);
  const quantifiedVars: string[] = [];
  
  
  for (const varName of typeVars) {
    if (!envVars.has(varName)) {
      quantifiedVars.push(varName);
    }
  }
  return { type: substitutedType, quantifiedVars };
};

// Instantiate a type scheme by freshening all quantified variables (threading state)
export const instantiate = (
  scheme: TypeScheme,
  state: TypeState
): [Type, TypeState] => {
  const mapping = new Map<string, Type>();
  let currentState = state;
  for (const varName of scheme.quantifiedVars) {
    const [freshVar, newState] = freshTypeVariable(currentState);
    mapping.set(varName, freshVar);
    currentState = newState;
  }

  const [instantiatedType, finalState] = freshenTypeVariables(
    scheme.type,
    mapping,
    currentState
  );

  return [instantiatedType, finalState];
};

// Replace type variables with fresh ones, threading state
export const freshenTypeVariables = (
  type: Type,
  mapping: Map<string, Type> = new Map(),
  state: TypeState
): [Type, TypeState] => {
  switch (type.kind) {
    case "variable":
      if (mapping.has(type.name)) {
        // Copy constraints from the original variable to the fresh one
        const freshVar = mapping.get(type.name)!;
        if (isTypeKind(freshVar, "variable")) {
          freshVar.constraints = freshVar.constraints || [];
          if (type.constraints) {
            for (const c of type.constraints) {
              if (
                !freshVar.constraints.some(
                  (existing) => JSON.stringify(existing) === JSON.stringify(c)
                )
              ) {
                freshVar.constraints.push(c);
              }
            }
          }
        }
        return [freshVar, state];
      }
      return [type, state];
    case "function": {
      let currentState = state;
      const newParams: Type[] = [];
      for (const param of type.params) {
        const [newParam, nextState] = freshenTypeVariables(
          param,
          mapping,
          currentState
        );
        newParams.push(newParam);
        currentState = nextState;
      }
      const [newReturn, finalState] = freshenTypeVariables(
        type.return,
        mapping,
        currentState
      );
      return [{ ...type, params: newParams, return: newReturn }, finalState];
    }
    case "list": {
      const [newElem, nextState] = freshenTypeVariables(
        type.element,
        mapping,
        state
      );
      return [{ ...type, element: newElem }, nextState];
    }
    case "tuple": {
      let currentState = state;
      const newElems: Type[] = [];
      for (const el of type.elements) {
        const [newEl, nextState] = freshenTypeVariables(
          el,
          mapping,
          currentState
        );
        newElems.push(newEl);
        currentState = nextState;
      }
      return [{ ...type, elements: newElems }, currentState];
    }
    case "record": {
      let currentState = state;
      const newFields: { [key: string]: Type } = {};
      for (const [key, fieldType] of Object.entries(type.fields)) {
        const [newField, nextState] = freshenTypeVariables(
          fieldType,
          mapping,
          currentState
        );
        newFields[key] = newField;
        currentState = nextState;
      }
      return [{ ...type, fields: newFields }, currentState];
    }
    case "union": {
      let currentState = state;
      const newTypes: Type[] = [];
      for (const t of type.types) {
        const [newType, nextState] = freshenTypeVariables(
          t,
          mapping,
          currentState
        );
        newTypes.push(newType);
        currentState = nextState;
      }
      return [{ ...type, types: newTypes }, currentState];
    }
    case "variant": {
      let currentState = state;
      const newArgs: Type[] = [];
      for (const arg of type.args) {
        const [newArg, nextState] = freshenTypeVariables(
          arg,
          mapping,
          currentState
        );
        newArgs.push(newArg);
        currentState = nextState;
      }
      return [{ ...type, args: newArgs }, currentState];
    }
    default:
      return [type, state];
  }
};

// Helper to flatten semicolon-separated binary expressions into individual statements
const flattenStatements = (expr: Expression): Expression[] => {
  if (expr.kind === "binary" && expr.operator === ";") {
    return [...flattenStatements(expr.left), ...flattenStatements(expr.right)];
  }
  return [expr];
};

// Load standard library from stdlib.noo
export const loadStdlib = (state: TypeState): TypeState => {
  try {
    // Check if fs functions are available (they might not be in test environments)
    if (
      typeof fs.existsSync !== "function" ||
      typeof fs.readFileSync !== "function"
    ) {
      console.warn(
        `Warning: File system functions not available, skipping stdlib loading`
      );
      return state;
    }

    // Find stdlib.noo relative to this file
    const stdlibPath = path.join(__dirname, "..", "stdlib.noo");

    if (!fs.existsSync(stdlibPath)) {
      console.warn(`Warning: stdlib.noo not found at ${stdlibPath}`);
      return state;
    }

    const stdlibContent = fs.readFileSync(stdlibPath, "utf-8");
    const lexer = new Lexer(stdlibContent);
    const tokens = lexer.tokenize();
    const stdlibProgram = parse(tokens);

    // Flatten any semicolon-separated statements
    const allStatements: Expression[] = [];
    for (const statement of stdlibProgram.statements) {
      allStatements.push(...flattenStatements(statement));
    }

    let currentState = state;
    for (const statement of allStatements) {
      const result = typeExpression(statement, currentState);
      currentState = result.state;
    }

    return currentState;
  } catch (error) {
    console.warn(`Warning: Failed to load stdlib.noo:`, error);
    return state;
  }
};

// Initialize built-in types
export const initializeBuiltins = (state: TypeState): TypeState => {
  const newEnv = new Map(state.environment);

  // Arithmetic operators
  newEnv.set("+", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });
  newEnv.set("-", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });
  newEnv.set("*", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });
  newEnv.set("/", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });

  // Comparison operators
  newEnv.set("==", {
    type: functionType([typeVariable("a"), typeVariable("a")], boolType()),
    quantifiedVars: ["a"],
  });
  newEnv.set("!=", {
    type: functionType([typeVariable("a"), typeVariable("a")], boolType()),
    quantifiedVars: ["a"],
  });
  newEnv.set("<", {
    type: functionType([intType(), intType()], boolType()),
    quantifiedVars: [],
  });
  newEnv.set(">", {
    type: functionType([intType(), intType()], boolType()),
    quantifiedVars: [],
  });
  newEnv.set("<=", {
    type: functionType([intType(), intType()], boolType()),
    quantifiedVars: [],
  });
  newEnv.set(">=", {
    type: functionType([intType(), intType()], boolType()),
    quantifiedVars: [],
  });


  const tailType = functionType(
    [listTypeWithElement(typeVariable("a"))],
    listTypeWithElement(typeVariable("a"))
  );
  newEnv.set("tail", {
    type: tailType,
    quantifiedVars: ["a"],
  });
  newEnv.set("cons", {
    type: functionType(
      [typeVariable("a"), listTypeWithElement(typeVariable("a"))],
      listTypeWithElement(typeVariable("a"))
    ),
    quantifiedVars: [],
  });

  // Pipeline operator (pure)
  newEnv.set("|>", {
    type: functionType(
      [typeVariable("a"), functionType([typeVariable("a")], typeVariable("b"))],
      typeVariable("b")
    ),
    quantifiedVars: [],
  });

  // Thrush operator (pure) - same as pipeline
  newEnv.set("|", {
    type: functionType(
      [typeVariable("a"), functionType([typeVariable("a")], typeVariable("b"))],
      typeVariable("b")
    ),
    quantifiedVars: [],
  });

  // Semicolon operator (effectful - effects are unioned)
  newEnv.set(";", {
    type: functionType(
      [typeVariable("a"), typeVariable("b")],
      typeVariable("b")
    ),
    quantifiedVars: [],
  });

  // Dollar operator (low precedence function application)
  newEnv.set("$", {
    type: functionType(
      [functionType([typeVariable("a")], typeVariable("b")), typeVariable("a")],
      typeVariable("b")
    ),
    quantifiedVars: [],
  });

  // Effectful functions
  newEnv.set("print", {
    type: functionType([typeVariable("a")], typeVariable("a"), ["log"]),
    quantifiedVars: [],
  });

  // List utility functions (pure)
  newEnv.set("map", {
    type: functionType(
      [
        functionType([typeVariable("a")], typeVariable("b")),
        listTypeWithElement(typeVariable("a")),
      ],
      listTypeWithElement(typeVariable("b"))
    ),
    quantifiedVars: [],
  });
  newEnv.set("filter", {
    type: functionType(
      [
        functionType([typeVariable("a")], boolType()),
        listTypeWithElement(typeVariable("a")),
      ],
      listTypeWithElement(typeVariable("a"))
    ),
    quantifiedVars: [],
  });
  newEnv.set("reduce", {
    type: functionType(
      [
        functionType([typeVariable("b"), typeVariable("a")], typeVariable("b")),
        typeVariable("b"),
        listTypeWithElement(typeVariable("a")),
      ],
      typeVariable("b")
    ),
    quantifiedVars: [],
  });
  const lengthType = functionType(
    [listTypeWithElement(typeVariable("a"))],
    intType()
  );
  newEnv.set("length", {
    type: lengthType,
    quantifiedVars: ["a"],
  });
  newEnv.set("isEmpty", {
    type: functionType([listTypeWithElement(typeVariable("a"))], boolType()),
    quantifiedVars: [],
  });
  newEnv.set("append", {
    type: functionType(
      [
        listTypeWithElement(typeVariable("a")),
        listTypeWithElement(typeVariable("a")),
      ],
      listTypeWithElement(typeVariable("a"))
    ),
    quantifiedVars: [],
  });

  // Math utilities (pure)
  newEnv.set("abs", {
    type: functionType([intType()], intType()),
    quantifiedVars: [],
  });
  newEnv.set("max", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });
  newEnv.set("min", {
    type: functionType([intType(), intType()], intType()),
    quantifiedVars: [],
  });

  // String utilities (pure)
  newEnv.set("concat", {
    type: functionType([stringType(), stringType()], stringType()),
    quantifiedVars: [],
  });
  newEnv.set("toString", {
    type: functionType([typeVariable("a")], stringType()),
    quantifiedVars: [],
  });

  // Record utilities
  newEnv.set("hasKey", {
    type: functionType([recordType({}), stringType()], boolType()),
    quantifiedVars: [],
  });
  newEnv.set("hasValue", {
    type: functionType([recordType({}), typeVariable("a")], boolType()),
    quantifiedVars: [],
  });
  newEnv.set("set", {
    type: functionType(
      [
        typeVariable("accessor"), // Accept any accessor function type
        recordType({}),
        typeVariable("a"),
      ],
      recordType({})
    ),
    quantifiedVars: [],
  });

  // Tuple operations - only keep sound ones
  newEnv.set(
    "tupleLength",
    { type: functionType([tupleType([])], intType()), quantifiedVars: [] } // Any tuple -> Int
  );
  newEnv.set(
    "tupleIsEmpty",
    { type: functionType([tupleType([])], boolType()), quantifiedVars: [] } // Any tuple -> Bool
  );

  // Built-in ADT constructors
  // Option type constructors
  const optionType = (elementType: Type): Type => ({
    kind: "variant",
    name: "Option",
    args: [elementType],
  });

  newEnv.set("Some", {
    type: functionType([typeVariable("a")], optionType(typeVariable("a"))),
    quantifiedVars: ["a"],
  });

  newEnv.set("None", {
    type: optionType(typeVariable("a")),
    quantifiedVars: ["a"],
  });

  // head function is now self-hosted in stdlib.noo
  
  // Minimal built-in for self-hosted functions
  newEnv.set("list_get", {
    type: functionType([intType(), listTypeWithElement(typeVariable("a"))], typeVariable("a")),
    quantifiedVars: ["a"],
  });

  // Result type constructors
  const resultType = (successType: Type, errorType: Type): Type => ({
    kind: "variant",
    name: "Result",
    args: [successType, errorType],
  });

  newEnv.set("Ok", {
    type: functionType(
      [typeVariable("a")],
      resultType(typeVariable("a"), typeVariable("b"))
    ),
    quantifiedVars: ["a", "b"],
  });

  newEnv.set("Err", {
    type: functionType(
      [typeVariable("b")],
      resultType(typeVariable("a"), typeVariable("b"))
    ),
    quantifiedVars: ["a", "b"],
  });

  // Register ADTs in the registry
  const newRegistry = new Map(state.adtRegistry);

  newRegistry.set("Option", {
    typeParams: ["a"],
    constructors: new Map([
      ["Some", [typeVariable("a")]],
      ["None", []],
    ]),
  });

  newRegistry.set("Result", {
    typeParams: ["a", "b"],
    constructors: new Map([
      ["Ok", [typeVariable("a")]],
      ["Err", [typeVariable("b")]],
    ]),
  });

  // Utility functions for Option and Result
  // Option utilities
  newEnv.set("isSome", {
    type: functionType([optionType(typeVariable("a"))], boolType()),
    quantifiedVars: ["a"],
  });

  newEnv.set("isNone", {
    type: functionType([optionType(typeVariable("a"))], boolType()),
    quantifiedVars: ["a"],
  });

  newEnv.set("unwrap", {
    type: functionType([optionType(typeVariable("a"))], typeVariable("a")),
    quantifiedVars: ["a"],
  });

  // Result utilities
  newEnv.set("isOk", {
    type: functionType(
      [resultType(typeVariable("a"), typeVariable("b"))],
      boolType()
    ),
    quantifiedVars: ["a", "b"],
  });

  newEnv.set("isErr", {
    type: functionType(
      [resultType(typeVariable("a"), typeVariable("b"))],
      boolType()
    ),
    quantifiedVars: ["a", "b"],
  });

  return { ...state, environment: newEnv, adtRegistry: newRegistry };
};

// Type inference for expressions
export const typeExpression = (
  expr: Expression,
  state: TypeState
): TypeResult => {
  switch (expr.kind) {
    case "literal":
      return typeLiteral(expr, state);

    case "variable":
      return typeVariableExpr(expr, state);

    case "function":
      return typeFunction(expr, state);

    case "application":
      return typeApplication(expr, state);

    case "pipeline":
      return typePipeline(expr, state);

    case "binary":
      return typeBinary(expr, state);

    case "if":
      return typeIf(expr, state);

    case "definition":
      return typeDefinition(expr, state);

    case "mutable-definition":
      return typeMutableDefinition(expr, state);

    case "mutation":
      return typeMutation(expr, state);

    case "import":
      return typeImport(expr, state);

    case "record":
      return typeRecord(expr, state);

    case "accessor":
      return typeAccessor(expr, state);

    case "list":
      return typeList(expr, state);

    case "tuple":
      return typeTuple(expr, state);

    case "where":
      return typeWhere(expr, state);

    case "unit":
      return { type: unitType(), state };

    case "typed":
      return typeTyped(expr, state);

    case "constrained":
      return typeConstrained(expr, state);

    case "type-definition":
      return typeTypeDefinition(expr, state);

    case "match":
      return typeMatch(expr, state);

    default:
      throw new Error(
        `Unsupported expression kind: ${(expr as Expression).kind}`
      );
  }
};

// Type inference for literals
export const typeLiteral = (
  expr: LiteralExpression,
  state: TypeState
): TypeResult => {
  const value = expr.value;

  if (typeof value === "number") {
    return { type: intType(), state };
  } else if (typeof value === "string") {
    return { type: stringType(), state };
  } else {
    return { type: unknownType(), state };
  }
};


// Update typeFunction to thread state through freshenTypeVariables
export const typeFunction = (
  expr: FunctionExpression,
  state: TypeState
): TypeResult => {
  // Create a fresh environment for the function body
  let functionEnv = new Map(state.environment);
  let currentState = { ...state, environment: functionEnv };

  const paramTypes: Type[] = [];
  for (const param of expr.params) {
    const [paramType, nextState] = freshTypeVariable(currentState);
    functionEnv.set(param, { type: paramType, quantifiedVars: [] });
    paramTypes.push(paramType);
    currentState = { ...nextState, environment: functionEnv };
  }

  // Type the function body with the function-local environment
  const bodyResult = typeExpression(expr.body, currentState);
  currentState = bodyResult.state;

  // Decorate the function body with its inferred type
  expr.body.type = bodyResult.type;

  // Restore the original environment for the outer scope
  currentState = { ...currentState, environment: state.environment };

  // Special handling for constrained function bodies
  let funcType: Type;

  if (expr.body.kind === "constrained") {
    const constrainedBody = expr.body as ConstrainedExpression;
    const constraints = flattenConstraintExpr(constrainedBody.constraint);

    // If the constrained body has an explicit function type, use it as the innermost type
    if (constrainedBody.type.kind === "function") {
      funcType = constrainedBody.type;

      // Apply constraints to this function type
      if (constraints.length > 0) {
        funcType.constraints = constraints;
        // Store the original constraint expression for display purposes
        (funcType as any).originalConstraint = constrainedBody.constraint;

        // CRITICAL: Also propagate constraints to type variables in parameters
        // This ensures constraint validation works during function application
        for (const constraint of constraints) {
          if (constraint.kind === "is") {
            propagateConstraintToTypeVariable(funcType, constraint);
          }
        }
      }

      // If we have more parameters than the explicit type accounts for, wrap it
      const explicitParamCount = countFunctionParams(constrainedBody.type);
      const actualParamCount = paramTypes.length;
      if (actualParamCount > explicitParamCount) {
        // Wrap the explicit function type with additional parameter layers
        for (let i = actualParamCount - explicitParamCount - 1; i >= 0; i--) {
          funcType = functionType([paramTypes[i]], funcType);
        }
      }
    } else {
      // Build function type normally and apply constraints
      funcType = bodyResult.type;
      for (let i = paramTypes.length - 1; i >= 0; i--) {
        funcType = functionType([paramTypes[i]], funcType);
      }
      if (constraints.length > 0 && funcType.kind === "function") {
        funcType.constraints = constraints;
      }
    }
  } else {
    // Build the function type normally
    funcType = bodyResult.type;
    for (let i = paramTypes.length - 1; i >= 0; i--) {
      funcType = functionType([paramTypes[i]], funcType);
    }
    
  }

  return { type: funcType, state: currentState };
};

// Update typeApplication to thread state through freshenTypeVariables
export const typeApplication = (
  expr: ApplicationExpression,
  state: TypeState
): TypeResult => {
  let currentState = state;

  // Type the function
  const funcResult = typeExpression(expr.func, currentState);
  currentState = funcResult.state;
  let funcType = funcResult.type;

  // Type each argument
  const argTypes: Type[] = [];
  for (const arg of expr.args) {
    const argResult = typeExpression(arg, currentState);
    argTypes.push(argResult.type);
    currentState = argResult.state;
  }

  // Handle function application by checking if funcType is a function
  if (funcType.kind === "function") {
    if (argTypes.length > funcType.params.length) {
      throw new Error(
        formatTypeError(
          functionApplicationError(
            funcType.params[funcType.params.length - 1],
            argTypes[funcType.params.length - 1],
            funcType.params.length - 1,
            undefined,
            {
              line: expr.location?.start.line || 1,
              column: expr.location?.start.column || 1,
            }
          )
        )
      );
    }

    // Unify each argument with the corresponding parameter type
    for (let i = 0; i < argTypes.length; i++) {
      currentState = unify(
        funcType.params[i],
        argTypes[i],
        currentState,
        {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        },
        {
          reason: "function_application",
          operation: `applying argument ${i + 1}`,
          hint: `Argument ${i + 1} has type ${typeToString(
            argTypes[i],
            currentState.substitution
          )} but the function parameter expects ${typeToString(
            funcType.params[i],
            currentState.substitution
          )}.`,
        }
      );

      // After unification, validate constraints on the parameter
      const substitutedParam = substitute(
        funcType.params[i],
        currentState.substitution
      );

      // Check if the parameter has constraints that need to be validated
      if (
        substitutedParam.kind === "variable" &&
        substitutedParam.constraints
      ) {
        // Validate each constraint
        for (const constraint of substitutedParam.constraints) {
          if (constraint.kind === "is") {
            // Check if the type variable has been unified to a concrete type
            const concreteType = currentState.substitution.get(
              constraint.typeVar
            );
            if (concreteType && concreteType.kind !== "variable") {
              // The type variable has been unified to a concrete type, validate the constraint
              if (!satisfiesConstraint(concreteType, constraint.constraint)) {
                throw new Error(
                  formatTypeError(
                    createTypeError(
                      `Type ${typeToString(
                        concreteType,
                        currentState.substitution
                      )} does not satisfy constraint '${
                        constraint.constraint
                      }'`,
                      {},
                      {
                        line: expr.location?.start.line || 1,
                        column: expr.location?.start.column || 1,
                      }
                    )
                  )
                );
              }
            }
          }
        }
      }

      // Also validate constraints on the argument type
      const substitutedArg = substitute(argTypes[i], currentState.substitution);
      if (substitutedArg.kind === "variable" && substitutedArg.constraints) {
        for (const constraint of substitutedArg.constraints) {
          if (constraint.kind === "is") {
            const concreteType = currentState.substitution.get(
              constraint.typeVar
            );
            if (concreteType && concreteType.kind !== "variable") {
              if (!satisfiesConstraint(concreteType, constraint.constraint)) {
                throw new Error(
                  formatTypeError(
                    createTypeError(
                      `Type ${typeToString(
                        concreteType,
                        currentState.substitution
                      )} does not satisfy constraint '${
                        constraint.constraint
                      }'`,
                      {},
                      {
                        line: expr.location?.start.line || 1,
                        column: expr.location?.start.column || 1,
                      }
                    )
                  )
                );
              }
            }
          }
        }
      }

      // CRITICAL: Also check if the argument type itself satisfies constraints
      // This is needed for cases where the argument is a concrete type that should satisfy constraints
      if (substitutedArg.kind !== "variable") {
        // Check if the parameter has constraints that the argument should satisfy
        if (
          substitutedParam.kind === "variable" &&
          substitutedParam.constraints
        ) {
          for (const constraint of substitutedParam.constraints) {
            if (constraint.kind === "is") {
              if (!satisfiesConstraint(substitutedArg, constraint.constraint)) {
                throw new Error(
                  formatTypeError(
                    createTypeError(
                      `Type ${typeToString(
                        substitutedArg,
                        currentState.substitution
                      )} does not satisfy constraint '${
                        constraint.constraint
                      }'`,
                      {},
                      {
                        line: expr.location?.start.line || 1,
                        column: expr.location?.start.column || 1,
                      }
                    )
                  )
                );
              }
            }
          }
        }
      }
    }

    // Apply substitution to get the return type
    const returnType = substitute(funcType.return, currentState.substitution);

    // Validate constraints on the return type
    currentState = validateConstraints(returnType, currentState, {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    });

    if (argTypes.length === funcType.params.length) {
      // Full application - return the return type
      
      // CRITICAL FIX: Handle function composition constraint propagation
      let finalReturnType = returnType;
      
      // Case 1: Direct compose function call
      if (expr.func.kind === "variable" && expr.func.name === "compose" && 
          expr.args.length >= 1) {
        const fArg = expr.args[0];  // First function (f in "compose f g")
        const fResult = typeExpression(fArg, currentState);
        
        // If f has constraints and returnType is a function, propagate the constraints
        if (fResult.type.kind === "function" && fResult.type.constraints && 
            returnType.kind === "function") {
          const enhancedReturnType = { ...returnType };
          
          // Map constraint variables from f's type to the new function's type variables
          const updatedConstraints: Constraint[] = [];
          for (const constraint of fResult.type.constraints) {
            if (constraint.kind === "is") {
              // Find the corresponding parameter in the new function
              // The first parameter of the composed function should inherit f's parameter constraints
              if (enhancedReturnType.params.length > 0 && enhancedReturnType.params[0].kind === "variable") {
                const newConstraint = isConstraint(enhancedReturnType.params[0].name, constraint.constraint);
                updatedConstraints.push(newConstraint);
              }
            } else {
              // For non-"is" constraints, copy as-is for now
              updatedConstraints.push(constraint);
            }
          }
          
          enhancedReturnType.constraints = (enhancedReturnType.constraints || []).concat(updatedConstraints);
          
          // Also propagate constraints to parameter type variables in the result function
          for (const constraint of updatedConstraints) {
            if (constraint.kind === "is") {
              propagateConstraintToTypeVariable(enhancedReturnType, constraint);
            }
          }
          
          finalReturnType = enhancedReturnType;
        }
      }
      
      // Case 2: Application to result of compose (e.g., (compose head) id)
      else if (expr.func.kind === "application" && 
               expr.func.func.kind === "variable" && 
               expr.func.func.name === "compose" && 
               expr.func.args.length >= 1) {
        // This is applying the second argument to a partial compose result
        const fArg = expr.func.args[0];  // First function from the compose
        const fResult = typeExpression(fArg, currentState);
        
        if (fResult.type.kind === "function" && fResult.type.constraints && 
            returnType.kind === "function") {
          const enhancedReturnType = { ...returnType };
          
          // Map constraint variables from f's type to the new function's type variables
          const updatedConstraints: Constraint[] = [];
          for (const constraint of fResult.type.constraints) {
            if (constraint.kind === "is") {
              // Find the corresponding parameter in the new function
              if (enhancedReturnType.params.length > 0 && enhancedReturnType.params[0].kind === "variable") {
                const newConstraint = isConstraint(enhancedReturnType.params[0].name, constraint.constraint);
                updatedConstraints.push(newConstraint);
              }
            } else {
              updatedConstraints.push(constraint);
            }
          }
          
          enhancedReturnType.constraints = (enhancedReturnType.constraints || []).concat(updatedConstraints);
          
          for (const constraint of updatedConstraints) {
            if (constraint.kind === "is") {
              propagateConstraintToTypeVariable(enhancedReturnType, constraint);
            }
          }
          
          finalReturnType = enhancedReturnType;
        }
      }
      
      return { type: finalReturnType, state: currentState };
    } else {
      // Partial application - return a function with remaining parameters
      const remainingParams = funcType.params.slice(argTypes.length);
      const partialFunctionType = functionType(remainingParams, returnType);
      
      // CRITICAL FIX: Handle partial application of compose
      if (expr.func.kind === "variable" && expr.func.name === "compose" && 
          expr.args.length >= 1) {
        const fArg = expr.args[0];  // First function
        const fResult = typeExpression(fArg, currentState);
        
        // If f has constraints, the partial result should eventually inherit them
        if (fResult.type.kind === "function" && fResult.type.constraints && 
            partialFunctionType.kind === "function") {
          partialFunctionType.constraints = (partialFunctionType.constraints || []).concat(fResult.type.constraints);
          
          for (const constraint of fResult.type.constraints) {
            if (constraint.kind === "is") {
              propagateConstraintToTypeVariable(partialFunctionType, constraint);
            }
          }
        }
      }
      
      return { type: partialFunctionType, state: currentState };
    }
  } else if (funcType.kind === "variable") {
    // If it's a type variable, create a function type and unify
    if (argTypes.length === 0) {
      return { type: funcType, state: currentState };
    }

    const [paramType, newState] = freshTypeVariable(currentState);
    currentState = newState;
    const [returnType, finalState] = freshTypeVariable(currentState);
    currentState = finalState;

    const freshFunctionType = functionType([paramType], returnType);
    currentState = unify(funcType, freshFunctionType, currentState, {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    });
    currentState = unify(paramType, argTypes[0], currentState, {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    });

    return {
      type: substitute(returnType, currentState.substitution),
      state: currentState,
    };
  } else {
    throw new Error(
      formatTypeError(
        nonFunctionApplicationError(funcType, {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        })
      )
    );
  }
};

// Type inference for binary expressions
export const typeBinary = (
  expr: BinaryExpression,
  state: TypeState
): TypeResult => {
  let currentState = state;

  // Type left operand
  const leftResult = typeExpression(expr.left, currentState);
  currentState = leftResult.state;

  // Type right operand
  const rightResult = typeExpression(expr.right, currentState);
  currentState = rightResult.state;

  // Special handling for semicolon operator (sequence)
  if (expr.operator === ";") {
    // The type of a sequence is the type of the right expression
    // Freshen type variables for the right result (thread state)
    const [finalType, finalState] = freshenTypeVariables(
      rightResult.type,
      new Map(),
      currentState
    );
    return { type: finalType, state: finalState };
  }

  // Special handling for thrush operator (|) - function application
  if (expr.operator === "|") {
    // Thrush: a | b means b(a) - apply right function to left value
    if (rightResult.type.kind !== "function") {
      throw new Error(
        formatTypeError(
          nonFunctionApplicationError(rightResult.type, {
            line: expr.location?.start.line || 1,
            column: expr.location?.start.column || 1,
          })
        )
      );
    }

    // Check that the function can take the left value as an argument
    if (rightResult.type.params.length !== 1) {
      throw new Error(
        `Thrush operator requires function with exactly one parameter, got ${rightResult.type.params.length}`
      );
    }

    currentState = unify(
      rightResult.type.params[0],
      leftResult.type,
      currentState,
      {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      }
    );

    // Return the function's return type
    return { type: rightResult.type.return, state: currentState };
  }

  // Get operator type from environment
  const operatorScheme = currentState.environment.get(expr.operator);
  if (!operatorScheme) {
    throw new Error(`Unknown operator: ${expr.operator}`);
  }

  const [operatorType, newState] = instantiate(operatorScheme, currentState);
  currentState = newState;

  // Create fresh type variable for result
  const [resultType, finalState] = freshTypeVariable(currentState);
  currentState = finalState;

  // Build expected function type
  const expectedType = functionType(
    [leftResult.type, rightResult.type],
    resultType
  );

  // Unify operator type with expected type
  currentState = unify(
    operatorType,
    expectedType,
    currentState,
    {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    },
    {
      reason: "operator_application",
      operation: `applying operator ${expr.operator}`,
      hint: `The ${
        expr.operator
      } operator expects compatible operand types. Left operand: ${typeToString(
        leftResult.type,
        currentState.substitution
      )}, Right operand: ${typeToString(
        rightResult.type,
        currentState.substitution
      )}.`,
    }
  );

  // Apply substitution to get final result type
  const [finalResultType, finalResultState] = freshenTypeVariables(
    resultType,
    new Map(),
    currentState
  );

  return { type: finalResultType, state: finalResultState };
};

// Type inference for if expressions
export const typeIf = (expr: IfExpression, state: TypeState): TypeResult => {
  let currentState = state;

  // Type condition
  const conditionResult = typeExpression(expr.condition, currentState);
  currentState = conditionResult.state;

  // Unify condition with boolean
  currentState = unify(conditionResult.type, boolType(), currentState, {
    line: expr.location?.start.line || 1,
    column: expr.location?.start.column || 1,
  });

  // Type then branch
  const thenResult = typeExpression(expr.then, currentState);
  currentState = thenResult.state;

  // Type else branch
  const elseResult = typeExpression(expr.else, currentState);
  currentState = elseResult.state;

  // Unify then and else types
  currentState = unify(thenResult.type, elseResult.type, currentState, {
    line: expr.location?.start.line || 1,
    column: expr.location?.start.column || 1,
  });

  // Apply substitution to get final type
  const finalType = substitute(thenResult.type, currentState.substitution);

  return { type: finalType, state: currentState };
};

// Update typeDefinition to thread state through freshenTypeVariables
export const typeDefinition = (
  expr: DefinitionExpression,
  state: TypeState
): TypeResult => {
  let currentState = state;

  // Add placeholder for recursion before inferring the value
  const [placeholderType, newState] = freshTypeVariable(currentState);
  currentState = newState;

  const tempEnv = mapSet(currentState.environment, expr.name, {
    type: placeholderType,
    quantifiedVars: [],
  });
  currentState = { ...currentState, environment: tempEnv };

  // Type the value
  const valueResult = typeExpression(expr.value, currentState);
  currentState = valueResult.state;

  // Decorate the value with its inferred type
  expr.value.type = valueResult.type;

  // Unify placeholder with actual type for recursion
  currentState = unify(placeholderType, valueResult.type, currentState, {
    line: expr.location?.start.line || 1,
    column: expr.location?.start.column || 1,
  });

  // Remove the just-defined variable from the environment for generalization
  const envForGen = new Map(currentState.environment);
  envForGen.delete(expr.name);

  // Generalize the type before storing in the environment (apply substitution!)
  const scheme = generalize(
    valueResult.type,
    envForGen,
    currentState.substitution
  );

  // Add to environment with generalized type
  const finalEnv = mapSet(currentState.environment, expr.name, scheme);
  currentState = { ...currentState, environment: finalEnv };

  // Freshen type variables for the definition's value (thread state)
  const [finalType, finalState] = freshenTypeVariables(
    valueResult.type,
    new Map(),
    currentState
  );
  return { type: finalType, state: finalState };
};

// Type inference for variables
export const typeVariableExpr = (
  expr: VariableExpression,
  state: TypeState
): TypeResult => {
  const scheme = state.environment.get(expr.name);
  if (!scheme) {
    throw new Error(
      formatTypeError(
        undefinedVariableError(expr.name, {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        })
      )
    );
  }

  const [instantiatedType, newState] = instantiate(scheme, state);

  return { type: instantiatedType, state: newState };
};

// Type inference for pipeline expressions
export const typePipeline = (
  expr: PipelineExpression,
  state: TypeState
): TypeResult => {
  // Pipeline should be function composition, not function application
  // For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))

  if (expr.steps.length === 1) {
    return typeExpression(expr.steps[0], state);
  }

  // Start with the first function type
  let currentState = state;
  let composedType = typeExpression(expr.steps[0], currentState);
  currentState = composedType.state;

  // Compose with each subsequent function type
  for (let i = 1; i < expr.steps.length; i++) {
    const nextFuncType = typeExpression(expr.steps[i], currentState);
    currentState = nextFuncType.state;

    if (
      composedType.type.kind === "function" &&
      nextFuncType.type.kind === "function"
    ) {
      // Check that the output of composedType matches the input of nextFuncType
      if (nextFuncType.type.params.length !== 1) {
        throw new Error(
          formatTypeError(
            functionApplicationError(
              nextFuncType.type.params[0],
              nextFuncType.type,
              0,
              undefined,
              {
                line: expr.location?.start.line || 1,
                column: expr.location?.start.column || 1,
              }
            )
          )
        );
      }

      currentState = unify(
        composedType.type.return,
        nextFuncType.type.params[0],
        currentState,
        {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        }
      );

      // The composed function takes the input of the first function and returns the output of the last function
      composedType = {
        type: functionType(
          [composedType.type.params[0]],
          nextFuncType.type.return
        ),
        state: currentState,
      };
    } else {
      throw new Error(
        `Cannot compose non-function types in pipeline: ${typeToString(
          composedType.type
        )} and ${typeToString(nextFuncType.type)}`
      );
    }
  }

  return {
    type: substitute(composedType.type, currentState.substitution),
    state: currentState,
  };
};

// Type inference for mutable definitions
export const typeMutableDefinition = (
  expr: MutableDefinitionExpression,
  state: TypeState
): TypeResult => {
  // Handle mutable definitions similar to regular definitions
  const valueResult = typeExpression(expr.value, state);
  const newEnv = mapSet(state.environment, expr.name, {
    type: valueResult.type,
    quantifiedVars: [],
  });
  return {
    type: valueResult.type,
    state: { ...valueResult.state, environment: newEnv },
  };
};

// Type inference for mutations
export const typeMutation = (
  expr: MutationExpression,
  state: TypeState
): TypeResult => {
  // For mutations, we need to check that the target exists and the value type matches
  const targetScheme = state.environment.get(expr.target);
  if (!targetScheme) {
    throw new Error(
      formatTypeError(
        undefinedVariableError(expr.target, {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        })
      )
    );
  }

  const valueResult = typeExpression(expr.value, state);
  const newState = unify(
    targetScheme.type,
    valueResult.type,
    valueResult.state,
    {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    }
  );

  return { type: unitType(), state: newState }; // Mutations return unit
};

// Type inference for imports
export const typeImport = (
  expr: ImportExpression,
  state: TypeState
): TypeResult => {
  // For now, assume imports return a record type
  return { type: recordType({}), state };
};

// Type inference for records
export const typeRecord = (
  expr: RecordExpression,
  state: TypeState
): TypeResult => {
  const fields: { [key: string]: Type } = {};
  let currentState = state;

  for (const field of expr.fields) {
    const fieldResult = typeExpression(field.value, currentState);
    fields[field.name] = fieldResult.type;
    currentState = fieldResult.state;
  }

  return { type: recordType(fields), state: currentState };
};

// Type inference for accessors
export const typeAccessor = (
  expr: AccessorExpression,
  state: TypeState
): TypeResult => {
  // Accessors return functions that take any record with the required field and return the field type
  // @bar should have type {bar: a, ...} -> a (allows extra fields)
  const fieldName = expr.field;
  // Use a fresh type variable for the field type
  const [fieldType, nextState] = freshTypeVariable(state);
  // Create a simple type variable for the record (no constraints on the variable itself)
  const [recordVar, finalState] = freshTypeVariable(nextState);
  // Create a function type with constraints attached to the function type
  const funcType = functionType([recordVar], fieldType);
  // Add the constraint directly to the parameter variable
  if (recordVar.kind === "variable") {
    recordVar.constraints = [
      hasFieldConstraint(recordVar.name, fieldName, fieldType),
    ];
  }
  return {
    type: funcType,
    state: finalState,
  };
};

// Type inference for tuples
export const typeTuple = (
  expr: TupleExpression,
  state: TypeState
): TypeResult => {
  const elements: Type[] = [];
  let currentState = state;

  for (const element of expr.elements) {
    const elementResult = typeExpression(element, currentState);
    elements.push(elementResult.type);
    currentState = elementResult.state;
  }

  return { type: tupleType(elements), state: currentState };
};

// Type inference for lists
export const typeList = (
  expr: ListExpression,
  state: TypeState
): TypeResult => {
  if (expr.elements.length === 0) {
    // Empty list - we can't infer the element type
    return { type: listTypeWithElement(typeVariable("a")), state };
  }

  // Infer the type from the first element
  let currentState = state;
  const firstElementResult = typeExpression(expr.elements[0], currentState);
  currentState = firstElementResult.state;
  const firstElementType = firstElementResult.type;

  // Check that all elements have the same type
  for (let i = 1; i < expr.elements.length; i++) {
    const elementResult = typeExpression(expr.elements[i], currentState);
    currentState = elementResult.state;
    currentState = unify(firstElementType, elementResult.type, currentState, {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    });
  }

  // Apply substitution to get the resolved element type
  const resolvedElementType = substitute(
    firstElementType,
    currentState.substitution
  );
  return {
    type: listTypeWithElement(resolvedElementType),
    state: currentState,
  };
};

// Type inference for where expressions
export const typeWhere = (
  expr: WhereExpression,
  state: TypeState
): TypeResult => {
  // Create a new type environment with the where-clause definitions
  let whereEnv = new Map(state.environment);
  let currentState = { ...state, environment: whereEnv };

  // Type all definitions in the where clause
  for (const def of expr.definitions) {
    if ((def as DefinitionExpression).kind === "definition") {
      const definitionDef = def as DefinitionExpression;
      const valueResult = typeExpression(definitionDef.value, currentState);
      currentState = valueResult.state;

      // Generalize with respect to the current whereEnv (excluding the new binding)
      const tempEnv = new Map(currentState.environment);
      tempEnv.delete(definitionDef.name);
      const scheme = generalize(
        valueResult.type,
        tempEnv,
        currentState.substitution
      );

      whereEnv = mapSet(currentState.environment, definitionDef.name, scheme);
      currentState = { ...currentState, environment: whereEnv };
    } else if (
      (def as MutableDefinitionExpression).kind === "mutable-definition"
    ) {
      const mutableDef = def as MutableDefinitionExpression;
      const valueResult = typeExpression(mutableDef.value, currentState);
      currentState = valueResult.state;

      whereEnv = mapSet(currentState.environment, mutableDef.name, {
        type: valueResult.type,
        quantifiedVars: [],
      });
      currentState = { ...currentState, environment: whereEnv };
    }
  }

  // Type the main expression
  const resultResult = typeExpression(expr.main, currentState);

  return { type: resultResult.type, state: resultResult.state };
};

// Type inference for typed expressions
export const typeTyped = (
  expr: TypedExpression,
  state: TypeState
): TypeResult => {
  // For typed expressions, validate that the explicit type matches the inferred type
  const inferredResult = typeExpression(expr.expression, state);
  const explicitType = expr.type;

  const newState = unify(
    inferredResult.type,
    explicitType,
    inferredResult.state,
    {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    }
  );

  return { type: explicitType, state: newState }; // Use the explicit type
};

// Type inference for constrained expressions
export const typeConstrained = (
  expr: ConstrainedExpression,
  state: TypeState
): TypeResult => {
  // For constrained expressions, validate that the explicit type matches the inferred type
  const inferredResult = typeExpression(expr.expression, state);
  const explicitType = expr.type;

  let currentState = unify(
    inferredResult.type,
    explicitType,
    inferredResult.state,
    {
      line: expr.location?.start.line || 1,
      column: expr.location?.start.column || 1,
    }
  );

  // Special case: if this constrained expression is inside a function body,
  // the constraint should apply to the function type, not to this expression
  // For now, we'll just return the explicit type without applying constraints here
  // The constraint will be handled at the function level

  // Return the explicit type without constraints applied
  return { type: explicitType, state: currentState };
};

// Create a mapping from constraint variable names to actual type variable names
const createConstraintVariableMapping = (type: Type): Map<string, string> => {
  const mapping = new Map<string, string>();
  const typeVars = freeTypeVars(type);

  // For now, we'll use a simple heuristic: map constraint vars to type vars in order
  // This assumes that constraint variables like 'a', 'b' correspond to type variables in order
  const constraintVars = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];
  const typeVarArray = Array.from(typeVars);

  for (
    let i = 0;
    i < Math.min(constraintVars.length, typeVarArray.length);
    i++
  ) {
    mapping.set(constraintVars[i], typeVarArray[i]);
  }

  return mapping;
};

// Apply constraints to type variables in a type
export const applyConstraintsToType = (
  constraintExpr: ConstraintExpr,
  type: Type,
  state: TypeState,
  mapping: Map<string, string>,
  location?: { line: number; column: number }
): TypeState => {
  // Extract all type variables from the type
  const typeVars = freeTypeVars(type);

  // For each constraint in the expression, apply it to the relevant type variables
  const constraints = flattenConstraintExpr(constraintExpr);

  for (const constraint of constraints) {
    if (constraint.kind === "is" && typeVars.has(constraint.typeVar)) {
      // Find the actual type variable in the type and apply the constraint to it
      applyConstraintToTypeVariable(type, constraint, state, mapping);
    }
  }

  return state;
};

// Helper function to apply a constraint to a specific type variable within a type
const applyConstraintToTypeVariable = (
  type: Type,
  constraint: Constraint,
  state: TypeState,
  mapping: Map<string, string>
): void => {
  switch (type.kind) {
    case "variable":
      // Apply constraint directly if the type variable name matches the constraint variable name
      if (type.name === constraint.typeVar) {
        // This is the type variable we want to constrain
        if (!type.constraints) {
          type.constraints = [];
        }
        // Check if this constraint is already present
        const existingConstraint = type.constraints.find(
          (c) => JSON.stringify(c) === JSON.stringify(constraint)
        );
        if (!existingConstraint) {
          type.constraints.push(constraint);
        }
      }
      break;
    case "function":
      // Apply to parameters and return type
      for (const param of type.params) {
        applyConstraintToTypeVariable(param, constraint, state, mapping);
      }
      applyConstraintToTypeVariable(type.return, constraint, state, mapping);
      break;
    case "list":
      applyConstraintToTypeVariable(type.element, constraint, state, mapping);
      break;
    case "tuple":
      for (const element of type.elements) {
        applyConstraintToTypeVariable(element, constraint, state, mapping);
      }
      break;
    case "record":
      for (const fieldType of Object.values(type.fields)) {
        applyConstraintToTypeVariable(fieldType, constraint, state, mapping);
      }
      break;
    case "union":
      for (const unionType of type.types) {
        applyConstraintToTypeVariable(unionType, constraint, state, mapping);
      }
      break;
    // For primitives, unit, unknown: do nothing
  }
};

// Flatten a constraint expression into a list of atomic constraints
const flattenConstraintExpr = (expr: ConstraintExpr): Constraint[] => {
  switch (expr.kind) {
    case "is":
      // Validate constraint name
      validateConstraintName(expr.constraint);
      return [expr];
    case "hasField":
    case "implements":
    case "custom":
      return [expr];
    case "and":
      return [
        ...flattenConstraintExpr(expr.left),
        ...flattenConstraintExpr(expr.right),
      ];
    case "or":
      return [
        ...flattenConstraintExpr(expr.left),
        ...flattenConstraintExpr(expr.right),
      ];
    case "paren":
      return flattenConstraintExpr(expr.expr);
    default:
      return [];
  }
};

// Evaluate a constraint expression recursively
export const evaluateConstraintExpr = (
  constraintExpr: ConstraintExpr,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  switch (constraintExpr.kind) {
    case "is":
    case "hasField":
    case "implements":
    case "custom":
      // Atomic constraint - apply directly
      return solveConstraint(constraintExpr, state, location);

    case "and":
      // Both left and right must be satisfied
      let leftState = evaluateConstraintExpr(
        constraintExpr.left,
        state,
        location
      );
      return evaluateConstraintExpr(constraintExpr.right, leftState, location);

    case "or":
      // At least one must be satisfied - try left first, then right if left fails
      try {
        return evaluateConstraintExpr(constraintExpr.left, state, location);
      } catch (error) {
        // If left fails, try right
        return evaluateConstraintExpr(constraintExpr.right, state, location);
      }

    case "paren":
      // Parentheses just group - evaluate the inner expression
      return evaluateConstraintExpr(constraintExpr.expr, state, location);

    default:
      throw new Error(
        `Unknown constraint expression kind: ${(constraintExpr as any).kind}`
      );
  }
};

// Comprehensive constraint validation
export const validateConstraints = (
  type: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  let currentState = state;

  // Apply substitution to get the concrete type
  const substitutedType = substitute(type, state.substitution);

  // If it's a type variable with constraints, check them
  if (substitutedType.kind === "variable" && substitutedType.constraints) {
    for (const constraint of substitutedType.constraints) {
      currentState = solveConstraint(constraint, currentState, location);
    }
  }

  // If it's a function type, check constraints on parameters and return type
  if (substitutedType.kind === "function") {
    // Check constraints on parameters
    for (const param of substitutedType.params) {
      currentState = validateConstraints(param, currentState, location);
    }

    // Check constraints on return type
    currentState = validateConstraints(
      substitutedType.return,
      currentState,
      location
    );

    // Check function-level constraints
    if (substitutedType.constraints) {
      currentState = solveConstraints(
        substitutedType.constraints,
        currentState,
        location
      );
    }
  }

  // If it's a list type, check constraints on element type
  if (substitutedType.kind === "list") {
    currentState = validateConstraints(
      substitutedType.element,
      currentState,
      location
    );
  }

  // If it's a record type, check constraints on field types
  if (substitutedType.kind === "record") {
    for (const fieldType of Object.values(substitutedType.fields)) {
      currentState = validateConstraints(fieldType, currentState, location);
    }
  }

  return currentState;
};

// After type inference, validate all constraints in the substitution map
function validateAllSubstitutionConstraints(state: TypeState) {
  for (const [varName, concreteType] of state.substitution.entries()) {
    // Only check if the concreteType is not a variable
    if (concreteType.kind !== "variable") {
      // Collect all constraints from the substitution chain
      const constraintsToCheck = collectAllConstraintsForVar(
        varName,
        state.substitution
      );
      for (const constraint of constraintsToCheck) {
        if (
          constraint.kind === "hasField" &&
          isTypeKind(concreteType, "record")
        ) {
          if (!(constraint.field in concreteType.fields)) {
            throw new Error(
              `Record type missing required field '${constraint.field}'`
            );
          }
          // Optionally, unify field types here if needed
        } else if (constraint.kind === "is") {
          if (!satisfiesConstraint(concreteType, constraint.constraint)) {
            throw new Error(
              `Type variable '${varName}' was unified to ${typeToString(
                concreteType
              )} but does not satisfy constraint '${constraint.constraint}'. This typically means a partial function is being used in an unsafe context. Consider using total functions that return Option or Result types instead of partial functions with constraints.`
            );
          }
        }
      }
    }
  }
}

export const typeProgram = (program: Program): TypeResult => {
  let state = createTypeState();
  state = initializeBuiltins(state);
  state = loadStdlib(state);

  let finalType: Type | null = null;

  for (const statement of program.statements) {
    const result = typeExpression(statement, state);
    state = result.state;
    finalType = result.type;
  }

  if (!finalType) {
    finalType = unitType();
  }

  // FINAL CONSTRAINT VALIDATION
  validateAllSubstitutionConstraints(state);

  // NEW: Additional constraint validation for the final type
  if (finalType.kind === "variable" && finalType.constraints) {
    for (const constraint of finalType.constraints) {
      if (constraint.kind === "is") {
        const substitutedType = substitute(finalType, state.substitution);
        if (
          substitutedType.kind !== "variable" &&
          !satisfiesConstraint(substitutedType, constraint.constraint)
        ) {
          throw new Error(
            `Type ${typeToString(
              substitutedType
            )} does not satisfy constraint '${constraint.constraint}'. This error often indicates that a partial function (one that can fail at runtime) is being used in a context where total functions are required, such as function composition. Consider using total functions that return Option or Result types instead.`
          );
        }
      }
    }
  }

  return { type: finalType, state };
};

// Decorate AST nodes with inferred types (like the class-based typeAndDecorate)
export const typeAndDecorate = (program: Program, initialState?: TypeState) => {
  let state = initialState || createTypeState();
  if (!initialState) {
    state = initializeBuiltins(state);
    state = loadStdlib(state);
  }

  // Helper to recursively decorate expressions
  function decorate(
    expr: Expression,
    state: TypeState
  ): [Expression, TypeState] {
    switch (expr.kind) {
      case "literal": {
        const result = typeLiteral(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "variable": {
        const result = typeVariableExpr(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "function": {
        // Let typeFunction handle the environment and decoration
        const result = typeFunction(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "application": {
        // Decorate func and args
        const [decoratedFunc, funcState] = decorate(expr.func, state);
        expr.func = decoratedFunc;
        let currentState = funcState;
        expr.args = expr.args.map((arg) => {
          const [decoratedArg, argState] = decorate(arg, currentState);
          currentState = argState;
          return decoratedArg;
        });
        const result = typeApplication(expr, currentState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "pipeline": {
        // Decorate steps
        let currentState = state;
        expr.steps = expr.steps.map((step) => {
          const [decoratedStep, stepState] = decorate(step, currentState);
          currentState = stepState;
          return decoratedStep;
        });
        const result = typePipeline(expr, currentState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "binary": {
        // Decorate left and right
        const [decoratedLeft, leftState] = decorate(expr.left, state);
        expr.left = decoratedLeft;
        const [decoratedRight, rightState] = decorate(expr.right, leftState);
        expr.right = decoratedRight;
        const result = typeBinary(expr, rightState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "if": {
        // Decorate condition, then, else
        const [decoratedCond, condState] = decorate(expr.condition, state);
        expr.condition = decoratedCond;
        const [decoratedThen, thenState] = decorate(expr.then, condState);
        expr.then = decoratedThen;
        const [decoratedElse, elseState] = decorate(expr.else, thenState);
        expr.else = decoratedElse;
        const result = typeIf(expr, elseState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "definition": {
        // Let typeDefinition handle the environment and decoration
        const result = typeDefinition(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "mutable-definition": {
        // Decorate value
        const [decoratedValue, valueState] = decorate(expr.value, state);
        expr.value = decoratedValue;
        const result = typeMutableDefinition(expr, valueState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "mutation": {
        // Decorate value
        const [decoratedValue, valueState] = decorate(expr.value, state);
        expr.value = decoratedValue;
        const result = typeMutation(expr, valueState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "import": {
        const result = typeImport(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "record": {
        // Decorate fields
        let currentState = state;
        expr.fields = expr.fields.map((field) => {
          const [decoratedValue, valueState] = decorate(
            field.value,
            currentState
          );
          currentState = valueState;
          return { ...field, value: decoratedValue };
        });
        const result = typeRecord(expr, currentState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "accessor": {
        const result = typeAccessor(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "list": {
        // Decorate elements
        let currentState = state;
        expr.elements = expr.elements.map((el) => {
          const [decoratedEl, elState] = decorate(el, currentState);
          currentState = elState;
          return decoratedEl;
        });
        const result = typeList(expr, currentState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "tuple": {
        // Decorate elements
        let currentState = state;
        expr.elements = expr.elements.map((el) => {
          const [decoratedEl, elState] = decorate(el, currentState);
          currentState = elState;
          return decoratedEl;
        });
        const result = typeTuple(expr, currentState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "where": {
        // Decorate definitions
        let currentState = state;
        expr.definitions = expr.definitions.map((def) => {
          const [decoratedDef, defState] = decorate(def, currentState);
          currentState = defState;
          return decoratedDef as
            | DefinitionExpression
            | MutableDefinitionExpression;
        });
        const [decoratedMain, mainState] = decorate(expr.main, currentState);
        expr.main = decoratedMain;
        const result = typeWhere(expr, mainState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "unit": {
        expr.type = unitType();
        return [expr, state];
      }
      case "typed": {
        // Decorate inner expression
        const [decoratedExpr, exprState] = decorate(expr.expression, state);
        expr.expression = decoratedExpr;
        const result = typeTyped(expr, exprState);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "type-definition": {
        const result = typeTypeDefinition(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "match": {
        const result = typeMatch(expr, state);
        expr.type = result.type;
        return [expr, result.state];
      }
      case "constrained": {
        const [decoratedExpr, exprState] = decorate(expr.expression, state);
        expr.expression = decoratedExpr;
        const result = typeConstrained(expr, exprState);
        expr.type = result.type;
        return [expr, result.state];
      }
      default:
        throw new Error(
          `Unknown expression kind: ${(expr as Expression).kind}`
        );
    }
  }

  // Decorate all top-level statements
  let currentState = state;
  const decoratedStatements = program.statements.map((stmt) => {
    const [decorated, nextState] = decorate(stmt, currentState);
    currentState = nextState;
    return decorated;
  });

  // Return a decorated program and the final state
  return {
    program: {
      ...program,
      statements: decoratedStatements,
    },
    state: currentState,
  };
};

// Utility function to convert type to string
export const typeToString = (
  type: Type,
  substitution: Map<string, Type> = new Map(),
  showConstraints: boolean = true
): string => {
  const greek = [
    "α",
    "β",
    "γ",
    "δ",
    "ε",
    "ζ",
    "η",
    "θ",
    "ι",
    "κ",
    "λ",
    "μ",
    "ν",
    "ξ",
    "ο",
    "π",
    "ρ",
    "σ",
    "τ",
    "υ",
    "φ",
    "χ",
    "ψ",
    "ω",
  ];
  const mapping = new Map<string, string>();
  let next = 0;

  function norm(t: Type): string {
    switch (t.kind) {
      case "primitive":
        return t.name;
      case "function": {
        const paramStr = t.params.map(norm).join(" ");
        const effectStr =
          t.effects.length > 0 ? ` !${t.effects.join(" !")}` : "";
        const baseType = `(${paramStr}) -> ${norm(t.return)}${effectStr}`;

        const constraintStr =
          showConstraints && t.constraints && t.constraints.length > 0
            ? ` given ${
                (t as any).originalConstraint
                  ? formatConstraintExpr((t as any).originalConstraint)
                  : deduplicateConstraints(t.constraints)
                      .map(formatConstraint)
                      .join(" ")
              }`
            : "";
        return constraintStr ? `${baseType}${constraintStr}` : baseType;
      }
      case "variable": {
        let varStr = "";
        if (!mapping.has(t.name)) {
          // If the type variable name is a single letter, keep it as-is
          // This preserves explicit type annotations like 'a -> a'
          if (t.name.length === 1 && /^[a-z]$/.test(t.name)) {
            mapping.set(t.name, t.name);
          } else {
            mapping.set(t.name, greek[next] || `t${next}`);
            next++;
          }
        }
        varStr = mapping.get(t.name)!;

        // Don't show constraints on type variables if we're in function context
        // The constraints will be shown at the function level instead
        // if (showConstraints && t.constraints && t.constraints.length > 0) {
        //   varStr += ` given ${deduplicateConstraints(t.constraints)
        //     .map(formatConstraint)
        //     .join(" ")}`;
        // }

        return varStr;
      }
      case "list":
        return `List ${norm(t.element)}`;
      case "tuple":
        return `(${t.elements.map(norm).join(" ")})`;
      case "record":
        return `{ ${Object.entries(t.fields)
          .map(([name, fieldType]) => `${name}: ${norm(fieldType)}`)
          .join(" ")} }`;
      case "union":
        return `(${t.types.map(norm).join(" | ")})`;
      case "variant":
        if (t.args.length === 0) {
          return t.name;
        } else {
          return `${t.name} ${t.args.map(norm).join(" ")}`;
        }
      case "unit":
        return "unit";
      case "unknown":
        return "?";
      default:
        return "unknown";
    }
  }

  function formatConstraint(c: Constraint): string {
    switch (c.kind) {
      case "is":
        // Use the normalized variable name for consistency
        const normalizedVarName = mapping.get(c.typeVar) || c.typeVar;
        return `${normalizedVarName} is ${c.constraint}`;
      case "hasField":
        // For hasField constraints, we need to use the normalized variable name
        // that matches the parameter it's constraining
        const normalizedVarName2 = mapping.get(c.typeVar) || c.typeVar;
        return `${normalizedVarName2} has field "${c.field}" of type ${norm(
          c.fieldType
        )}`;
      case "implements":
        const normalizedVarName3 = mapping.get(c.typeVar) || c.typeVar;
        return `${normalizedVarName3} implements ${c.interfaceName}`;
      case "custom":
        const normalizedVarName4 = mapping.get(c.typeVar) || c.typeVar;
        return `${normalizedVarName4} satisfies ${c.constraint} ${c.args
          .map(norm)
          .join(" ")}`;
      default:
        return "unknown constraint";
    }
  }

  function formatConstraintExpr(expr: ConstraintExpr): string {
    switch (expr.kind) {
      case "is":
      case "hasField":
      case "implements":
      case "custom":
        return formatConstraint(expr);
      case "and":
        return `${formatConstraintExpr(expr.left)} and ${formatConstraintExpr(
          expr.right
        )}`;
      case "or":
        return `${formatConstraintExpr(expr.left)} or ${formatConstraintExpr(
          expr.right
        )}`;
      case "paren":
        return `(${formatConstraintExpr(expr.expr)})`;
      default:
        return "unknown constraint";
    }
  }

  // Helper function to deduplicate constraints
  function deduplicateConstraints(constraints: Constraint[]): Constraint[] {
    const seen = new Set<string>();
    const result: Constraint[] = [];

    for (const constraint of constraints) {
      const key = JSON.stringify(constraint);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(constraint);
      }
    }

    return result;
  }

  // Apply substitution to the type before normalizing
  const substitutedType = substitute(type, substitution);
  return norm(substitutedType);
};

// --- Unification helpers ---
function unifyVariable(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "variable")) {
    throw new Error("unifyVariable called with non-variable s1");
  }
  // Recursively collect all constraints from the substitution chain for s1
  let constraintsToCheck: Constraint[] = [];
  let seenVars = new Set<string>();
  let currentVar: Type = s1;
  while (isTypeKind(currentVar, "variable")) {
    if (seenVars.has(currentVar.name)) break;
    seenVars.add(currentVar.name);
    if (currentVar.constraints) {
      constraintsToCheck.push(...currentVar.constraints);
    }
    const next = state.substitution.get(currentVar.name);
    if (!next) break;
    currentVar = next;
  }
  // If s2 is a variable, merge all constraints into it
  if (isTypeKind(s2, "variable")) {
    s2.constraints = s2.constraints || [];
    for (const c of constraintsToCheck) {
      if (
        !s2.constraints.some(
          (existing) => JSON.stringify(existing) === JSON.stringify(c)
        )
      ) {
        s2.constraints.push(c);
      }
    }
  }
  // Occurs check
  if (occursIn(s1.name, s2))
    throw new Error(
      formatTypeError(
        createTypeError(
          `Occurs check failed: ${s1.name} occurs in ${typeToString(
            s2,
            state.substitution
          )}`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  let newState = {
    ...state,
    substitution: mapSet(state.substitution, s1.name, s2),
  };
  // If s2 is not a variable, propagate or check constraints
  if (!isTypeKind(s2, "variable")) {
    for (const constraint of constraintsToCheck) {
      if (constraint.kind === "hasField" && isTypeKind(s2, "record")) {
        newState = unify(
          s2.fields[constraint.field],
          constraint.fieldType,
          newState,
          location
        );
      } else if (constraint.kind === "is") {
        if (isTypeKind(s2, "primitive")) {
          if (!satisfiesConstraint(s2, constraint.constraint)) {
            throw new Error(
              formatTypeError(
                createTypeError(
                  `Type ${typeToString(
                    s2,
                    state.substitution
                  )} does not satisfy constraint '${constraint.constraint}'. This error typically occurs when attempting to use a partial function (one that can fail) in an unsafe context like function composition. Consider using total functions that return Option or Result types instead.`,
                  {},
                  location || { line: 1, column: 1 }
                )
              )
            );
          }
        } else {
          // Propagate the constraint recursively to all type variables inside s2
          propagateConstraintToType(s2, constraint);
        }
      } else {
        // For other constraint kinds, propagate recursively
        propagateConstraintToType(s2, constraint);
      }
    }
  }
  return newState;
}

// Helper: Recursively push a constraint to all type variables inside a type
function propagateConstraintToType(type: Type, constraint: Constraint) {
  switch (type.kind) {
    case "variable":
      type.constraints = type.constraints || [];
      if (
        !type.constraints.some(
          (c) => JSON.stringify(c) === JSON.stringify(constraint)
        )
      ) {
        type.constraints.push(constraint);
      } else {
      }
      break;
    case "function":
      for (const param of type.params) {
        propagateConstraintToType(param, constraint);
      }
      propagateConstraintToType(type.return, constraint);
      break;
    case "list":
      propagateConstraintToType(type.element, constraint);
      break;
    case "tuple":
      for (const el of type.elements) {
        propagateConstraintToType(el, constraint);
      }
      break;
    case "record":
      for (const fieldType of Object.values(type.fields)) {
        propagateConstraintToType(fieldType, constraint);
      }
      break;
    case "union":
      for (const t of type.types) {
        propagateConstraintToType(t, constraint);
      }
      break;
    // For primitives, unit, unknown: do nothing
  }
}

function unifyFunction(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "function") || !isTypeKind(s2, "function")) {
    throw new Error("unifyFunction called with non-function types");
  }

  if (s1.params.length !== s2.params.length)
    throw new Error(
      formatTypeError(
        functionApplicationError(
          s1,
          s2,
          0,
          undefined,
          location || { line: 1, column: 1 }
        )
      )
    );

  let currentState = state;

  // First, propagate function-level constraints to the relevant type variables
  if (s1.constraints) {
    for (const constraint of s1.constraints) {
      // Propagate to all type variables in s1
      propagateConstraintToType(s1, constraint);
    }
  }

  if (s2.constraints) {
    for (const constraint of s2.constraints) {
      // Propagate to all type variables in s2
      propagateConstraintToType(s2, constraint);
    }
  }

  // Then unify parameters and return types
  for (let i = 0; i < s1.params.length; i++) {
    // Only propagate constraints if both are variables
    const s1var = s1.params[i];
    const s2var = s2.params[i];
    if (isTypeKind(s1var, "variable") && isTypeKind(s2var, "variable")) {
      s1var.constraints = s1var.constraints || [];
      s2var.constraints = s2var.constraints || [];
      // Propagate s1 -> s2
      for (const c of s1var.constraints) {
        if (
          !s2var.constraints.some(
            (existing: any) => JSON.stringify(existing) === JSON.stringify(c)
          )
        ) {
          s2var.constraints.push(c);
        }
      }
      // Propagate s2 -> s1
      for (const c of s2var.constraints) {
        if (
          !s1var.constraints.some(
            (existing: any) => JSON.stringify(existing) === JSON.stringify(c)
          )
        ) {
          s1var.constraints.push(c);
        }
      }
    }
    currentState = unify(s1.params[i], s2.params[i], currentState, location);
  }
  currentState = unify(s1.return, s2.return, currentState, location);

  return currentState;
}

function unifyList(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "list") || !isTypeKind(s2, "list")) {
    throw new Error("unifyList called with non-list types");
  }
  return unify(s1.element, s2.element, state, location);
}

function unifyTuple(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "tuple") || !isTypeKind(s2, "tuple")) {
    throw new Error("unifyTuple called with non-tuple types");
  }
  if (s1.elements.length !== s2.elements.length)
    throw new Error(
      formatTypeError(
        createTypeError(
          `Tuple length mismatch: ${s1.elements.length} vs ${s2.elements.length}`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  let currentState = state;
  for (let i = 0; i < s1.elements.length; i++) {
    currentState = unify(
      s1.elements[i],
      s2.elements[i],
      currentState,
      location
    );
  }
  return currentState;
}

function unifyVariant(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "variant") || !isTypeKind(s2, "variant")) {
    throw new Error("unifyVariant called with non-variant types");
  }

  // Variant types must have the same name (e.g., both "Option")
  if (s1.name !== s2.name) {
    throw new Error(
      formatTypeError(
        createTypeError(
          `Variant name mismatch: ${s1.name} vs ${s2.name}`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  }

  // Variant types must have the same number of type arguments
  if (s1.args.length !== s2.args.length) {
    throw new Error(
      formatTypeError(
        createTypeError(
          `Variant arity mismatch: ${s1.name} has ${s1.args.length} vs ${s2.args.length} type arguments`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  }

  // Unify corresponding type arguments
  let currentState = state;
  for (let i = 0; i < s1.args.length; i++) {
    currentState = unify(s1.args[i], s2.args[i], currentState, location);
  }
  return currentState;
}

function unifyRecord(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "record") || !isTypeKind(s2, "record")) {
    throw new Error("unifyRecord called with non-record types");
  }
  const keys1 = Object.keys(s1.fields);
  let currentState = state;
  for (const key of keys1) {
    if (!(key in s2.fields))
      throw new Error(
        formatTypeError(
          createTypeError(
            `Required field missing: ${key}`,
            {},
            location || { line: 1, column: 1 }
          )
        )
      );
    currentState = unify(
      s1.fields[key],
      s2.fields[key],
      currentState,
      location
    );
  }
  return currentState;
}

function unifyUnion(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "union") || !isTypeKind(s2, "union")) {
    throw new Error("unifyUnion called with non-union types");
  }
  // For now, require exact match of union types
  if (s1.types.length !== s2.types.length)
    throw new Error(
      formatTypeError(
        createTypeError(
          `Union type mismatch: ${s1.types.length} vs ${s2.types.length} types`,
          {},
          location || { line: 1, column: 1 }
        )
      )
    );
  let currentState = state;
  for (let i = 0; i < s1.types.length; i++) {
    currentState = unify(s1.types[i], s2.types[i], currentState, location);
  }
  return currentState;
}

function unifyPrimitive(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "primitive") || !isTypeKind(s2, "primitive")) {
    throw new Error("unifyPrimitive called with non-primitive types");
  }
  if (s1.name !== s2.name)
    throw new Error(
      formatTypeError(
        operatorTypeError("", s1, s2, location || { line: 1, column: 1 })
      )
    );
  return state;
}

function unifyUnit(
  s1: Type,
  s2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState {
  if (!isTypeKind(s1, "unit") || !isTypeKind(s2, "unit")) {
    throw new Error("unifyUnit called with non-unit types");
  }
  return state;
}

// Collect all constraints for a variable, following the substitution chain
function collectAllConstraintsForVar(
  varName: string,
  substitution: Map<string, Type>
): Constraint[] {
  const seen = new Set<string>();
  let constraints: Constraint[] = [];
  let currentVarName = varName;
  let currentType = substitution.get(currentVarName);

  while (currentType && isTypeKind(currentType, "variable")) {
    if (seen.has(currentVarName)) {
      break; // Prevent cycles
    }
    seen.add(currentVarName);

    if (currentType.constraints) {
      constraints = constraints.concat(currentType.constraints);
    }

    currentVarName = currentType.name;
    currentType = substitution.get(currentVarName);
  }

  // Also check the original variable
  const origType = substitution.get(varName);
  if (origType && isTypeKind(origType, "variable") && origType.constraints) {
    constraints = constraints.concat(origType.constraints);
  }

  return constraints;
}

// Type inference for ADT type definitions
export const typeTypeDefinition = (
  expr: TypeDefinitionExpression,
  state: TypeState
): TypeResult => {
  // Register the ADT in the registry first to enable recursive references
  const constructorMap = new Map<string, Type[]>();

  // Pre-register the ADT so recursive references work
  const newRegistry = new Map(state.adtRegistry);
  newRegistry.set(expr.name, {
    typeParams: expr.typeParams,
    constructors: constructorMap, // Will be filled
  });

  // Also add the ADT type constructor to the environment
  const adtType = {
    kind: "variant" as const,
    name: expr.name,
    args: expr.typeParams.map((param) => typeVariable(param)),
  };
  const envWithType = new Map(state.environment);
  envWithType.set(expr.name, {
    type: adtType,
    quantifiedVars: expr.typeParams,
  });

  state = { ...state, adtRegistry: newRegistry, environment: envWithType };

  // Process each constructor
  for (const constructor of expr.constructors) {
    constructorMap.set(constructor.name, constructor.args);

    // Add constructor to environment as a function
    // Constructor type: arg1 -> arg2 -> ... -> ADTType typeParams
    const adtType: Type = {
      kind: "variant",
      name: expr.name,
      args: expr.typeParams.map((param) => typeVariable(param)),
    };

    let constructorType: Type;
    if (constructor.args.length === 0) {
      // Nullary constructor: just the ADT type
      constructorType = adtType;
    } else {
      // N-ary constructor: function from args to ADT type
      constructorType = functionType(constructor.args, adtType);
    }

    // Add constructor to environment
    const newEnv = new Map(state.environment);
    newEnv.set(constructor.name, {
      type: constructorType,
      quantifiedVars: expr.typeParams,
    });
    state = { ...state, environment: newEnv };
  }

  // Update ADT registry with completed constructor map
  const finalRegistry = new Map(state.adtRegistry);
  finalRegistry.set(expr.name, {
    typeParams: expr.typeParams,
    constructors: constructorMap,
  });

  // Type definitions return unit and update state
  return {
    type: unitType(),
    state: { ...state, adtRegistry: finalRegistry },
  };
};

// Type inference for match expressions
export const typeMatch = (
  expr: MatchExpression,
  state: TypeState
): TypeResult => {
  // Type the expression being matched
  const exprResult = typeExpression(expr.expression, state);
  let currentState = exprResult.state;

  // Type each case and ensure they all return the same type
  if (expr.cases.length === 0) {
    throw new Error("Match expression must have at least one case");
  }

  // Type first case to get result type
  const firstCaseResult = typeMatchCase(
    expr.cases[0],
    exprResult.type,
    currentState
  );
  currentState = firstCaseResult.state;
  let resultType = firstCaseResult.type;

  // Type remaining cases and unify with result type
  for (let i = 1; i < expr.cases.length; i++) {
    const caseResult = typeMatchCase(
      expr.cases[i],
      exprResult.type,
      currentState
    );
    currentState = caseResult.state;

    // Unify case result type with overall result type
    currentState = unify(
      resultType,
      caseResult.type,
      currentState,
      expr.cases[i].location.start
    );
    resultType = substitute(resultType, currentState.substitution);
  }

  return { type: resultType, state: currentState };
};

// Type a single match case
const typeMatchCase = (
  matchCase: MatchCase,
  matchedType: Type,
  state: TypeState
): TypeResult => {
  // Type the pattern and get bindings
  const patternResult = typePattern(matchCase.pattern, matchedType, state);

  // Create new environment with pattern bindings
  const newEnv = new Map(patternResult.state.environment);
  for (const [name, type] of patternResult.bindings) {
    newEnv.set(name, { type, quantifiedVars: [] });
  }

  const envState = { ...patternResult.state, environment: newEnv };

  // Type the expression with pattern bindings in scope
  return typeExpression(matchCase.expression, envState);
};

// Type a pattern and return bindings
const typePattern = (
  pattern: Pattern,
  expectedType: Type,
  state: TypeState
): { state: TypeState; bindings: Map<string, Type> } => {
  const bindings = new Map<string, Type>();

  switch (pattern.kind) {
    case "wildcard":
      // Wildcard matches anything, no bindings
      return { state, bindings };

    case "variable":
      // Variable binds to the expected type
      bindings.set(pattern.name, expectedType);
      return { state, bindings };

    case "constructor": {
      // Constructor pattern matching with type variable handling
      let actualType = expectedType;
      let currentState = state;

      // If expected type is a type variable, we need to find the ADT from the constructor
      if (isTypeKind(expectedType, "variable")) {
        // Find which ADT this constructor belongs to
        let foundAdt: string | null = null;
        for (const [adtName, adtInfo] of state.adtRegistry) {
          if (adtInfo.constructors.has(pattern.name)) {
            foundAdt = adtName;
            break;
          }
        }

        if (!foundAdt) {
          throw new Error(`Unknown constructor: ${pattern.name}`);
        }

        // Create the ADT type with fresh type variables for type parameters
        const adtInfo = state.adtRegistry.get(foundAdt)!;
        const typeArgs: Type[] = [];
        const substitution = new Map<string, Type>();
        for (let i = 0; i < adtInfo.typeParams.length; i++) {
          const [freshVar, nextState] = freshTypeVariable(currentState);
          typeArgs.push(freshVar);
          substitution.set(adtInfo.typeParams[i], freshVar);
          currentState = nextState;
        }
        actualType = { kind: "variant", name: foundAdt, args: typeArgs };

        // Unify the type variable with the ADT type
        currentState = unify(expectedType, actualType, currentState, undefined);
      } else if (!isTypeKind(expectedType, "variant")) {
        throw new Error(
          `Pattern expects constructor but got ${typeToString(
            expectedType,
            state.substitution
          )}`
        );
      }

      // Look up constructor in ADT registry
      if (!isTypeKind(actualType, "variant")) {
        throw new Error(
          `Internal error: actualType should be variant but got ${actualType.kind}`
        );
      }
      const adtInfo = state.adtRegistry.get(actualType.name);
      if (!adtInfo) {
        throw new Error(`Unknown ADT: ${actualType.name}`);
      }

      const constructorArgs = adtInfo.constructors.get(pattern.name);
      if (!constructorArgs) {
        throw new Error(
          `Unknown constructor: ${pattern.name} for ADT ${actualType.name}`
        );
      }

      // Create a substitution from type parameters to actual type arguments
      const paramSubstitution = new Map<string, Type>();
      for (let i = 0; i < adtInfo.typeParams.length; i++) {
        paramSubstitution.set(adtInfo.typeParams[i], actualType.args[i]);
      }

      // Substitute type parameters with actual type arguments
      const substitutedArgs = constructorArgs.map((arg) =>
        substitute(arg, paramSubstitution)
      );

      // Check argument count
      if (pattern.args.length !== substitutedArgs.length) {
        throw new Error(
          `Constructor ${pattern.name} expects ${substitutedArgs.length} arguments but got ${pattern.args.length}`
        );
      }

      // Type each argument pattern
      for (let i = 0; i < pattern.args.length; i++) {
        const argResult = typePattern(
          pattern.args[i],
          substitutedArgs[i],
          currentState
        );
        currentState = argResult.state;

        // Merge bindings
        for (const [name, type] of argResult.bindings) {
          bindings.set(name, type);
        }
      }

      return { state: currentState, bindings };
    }

    case "literal":
      // Literal patterns need to match the expected type
      let literalType: Type;
      if (typeof pattern.value === "number") {
        literalType = intType();
      } else if (typeof pattern.value === "string") {
        literalType = stringType();
      } else {
        throw new Error(`Unsupported literal pattern: ${pattern.value}`);
      }

      const unifiedState = unify(
        expectedType,
        literalType,
        state,
        pattern.location.start
      );
      return { state: unifiedState, bindings };

    default:
      throw new Error(`Unsupported pattern kind: ${(pattern as Pattern).kind}`);
  }
};
