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
  Type,
  Effect,
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
  formatTypeError,
  createTypeError,
} from "./type-errors";

// Type scheme for let-polymorphism
export type TypeScheme = {
  type: Type;
  quantifiedVars: string[];
};

export type TypeEnvironment = Map<string, TypeScheme>;

// Functional state for type inference
export type TypeState = {
  environment: TypeEnvironment;
  substitution: Map<string, Type>;
  counter: number;
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
});

// Fresh type variable generation
export const freshTypeVariable = (state: TypeState): [Type, TypeState] => {
  const newCounter = state.counter + 1;
  const newType = typeVariable(`α${newCounter}`);
  return [newType, { ...state, counter: newCounter }];
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

// Apply substitution to a type
export const substitute = (
  type: Type,
  substitution: Map<string, Type>
): Type => {
  switch (type.kind) {
    case "variable": {
      const sub = substitution.get(type.name);
      if (sub) return substitute(sub, substitution);
      return type;
    }
    case "function":
      return {
        ...type,
        params: type.params.map((param) => substitute(param, substitution)),
        return: substitute(type.return, substitution),
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
    default:
      return type;
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
    default:
      return false;
  }
};

// Unify two types and update substitution
export const unify = (
  t1: Type,
  t2: Type,
  state: TypeState,
  location?: { line: number; column: number }
): TypeState => {
  const s1 = substitute(t1, state.substitution);
  const s2 = substitute(t2, state.substitution);
  if (typesEqual(s1, s2)) return state;
  if (isTypeKind(s1, "variable")) {
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
    return { ...state, substitution: mapSet(state.substitution, s1.name, s2) };
  }
  if (isTypeKind(s2, "variable")) {
    if (occursIn(s2.name, s1))
      throw new Error(
        formatTypeError(
          createTypeError(
            `Occurs check failed: ${s2.name} occurs in ${typeToString(
              s1,
              state.substitution
            )}`,
            {},
            location || { line: 1, column: 1 }
          )
        )
      );
    return { ...state, substitution: mapSet(state.substitution, s2.name, s1) };
  }
  if (isTypeKind(s1, "function") && isTypeKind(s2, "function")) {
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
    for (let i = 0; i < s1.params.length; i++) {
      currentState = unify(s1.params[i], s2.params[i], currentState, location);
    }
    return unify(s1.return, s2.return, currentState, location);
  }
  if (isTypeKind(s1, "list") && isTypeKind(s2, "list")) {
    return unify(s1.element, s2.element, state, location);
  }
  if (isTypeKind(s1, "tuple") && isTypeKind(s2, "tuple")) {
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
  if (isTypeKind(s1, "record") && isTypeKind(s2, "record")) {
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
  if (isTypeKind(s1, "union") && isTypeKind(s2, "union")) {
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
  if (isTypeKind(s1, "primitive") && isTypeKind(s2, "primitive")) {
    if (s1.name !== s2.name)
      throw new Error(
        formatTypeError(
          operatorTypeError("", s1, s2, location || { line: 1, column: 1 })
        )
      );
    return state;
  }
  if (isTypeKind(s1, "unit") && isTypeKind(s2, "unit")) return state;
  throw new Error(
    formatTypeError(
      createTypeError(
        `Cannot unify ${typeToString(
          s1,
          state.substitution
        )} with ${typeToString(s2, state.substitution)}`,
        {},
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
        return [mapping.get(type.name)!, state];
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
    default:
      return [type, state];
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
    quantifiedVars: [],
  });
  newEnv.set("!=", {
    type: functionType([typeVariable("a"), typeVariable("a")], boolType()),
    quantifiedVars: [],
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

  // List operations (pure)
  newEnv.set("head", {
    type: functionType(
      [listTypeWithElement(typeVariable("a"))],
      typeVariable("a")
    ),
    quantifiedVars: [],
  });
  newEnv.set("tail", {
    type: functionType(
      [listTypeWithElement(typeVariable("a"))],
      listTypeWithElement(typeVariable("a"))
    ),
    quantifiedVars: [],
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
  newEnv.set("length", {
    type: functionType([listTypeWithElement(typeVariable("a"))], intType()),
    quantifiedVars: [],
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

  return { ...state, environment: newEnv };
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
  } else if (typeof value === "boolean") {
    return { type: boolType(), state };
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

  // Build the function type
  let funcType = bodyResult.type;
  for (let i = paramTypes.length - 1; i >= 0; i--) {
    funcType = functionType([paramTypes[i]], funcType);
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
      currentState = unify(funcType.params[i], argTypes[i], currentState, {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      });
    }

    // Apply substitution to get the return type
    const returnType = substitute(funcType.return, currentState.substitution);

    if (argTypes.length === funcType.params.length) {
      // Full application - return the return type
      return { type: returnType, state: currentState };
    } else {
      // Partial application - return a function with remaining parameters
      const remainingParams = funcType.params.slice(argTypes.length);
      const partialFunctionType = functionType(remainingParams, returnType);
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
  currentState = unify(operatorType, expectedType, currentState, {
    line: expr.location?.start.line || 1,
    column: expr.location?.start.column || 1,
  });

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
  const fieldType = typeVariable("a");
  // Create a more specific record type that includes the required field
  const recordTypeValue = recordType({ [fieldName]: fieldType });
  return { type: functionType([recordTypeValue], fieldType), state };
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

// Type a program
export const typeProgram = (program: Program): TypeResult => {
  let state = createTypeState();
  state = initializeBuiltins(state);

  let finalType: Type | null = null;

  for (const statement of program.statements) {
    const result = typeExpression(statement, state);
    state = result.state;
    finalType = result.type;
  }

  if (!finalType) {
    finalType = unitType();
  }

  return { type: finalType, state };
};

// Decorate AST nodes with inferred types (like the class-based typeAndDecorate)
export const typeAndDecorate = (program: Program) => {
  let state = createTypeState();
  state = initializeBuiltins(state);

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
  substitution: Map<string, Type> = new Map()
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
        return `(${paramStr}) -> ${norm(t.return)}${effectStr}`;
      }
      case "variable": {
        if (!mapping.has(t.name)) {
          mapping.set(t.name, greek[next] || `t${next}`);
          next++;
        }
        return mapping.get(t.name)!;
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
      case "unit":
        return "unit";
      case "unknown":
        return "?";
      default:
        return "unknown";
    }
  }

  // Apply substitution to the type before normalizing
  const substitutedType = substitute(type, substitution);
  return norm(substitutedType);
};
