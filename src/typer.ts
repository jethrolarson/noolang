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
  Type,
  Effect,
  intType,
  stringType,
  boolType,
  listType,
  functionType,
  typeVariable,
  unknownType,
  unitType,
  listTypeWithElement,
  tupleType,
  recordType,
  resultType,
  optionType,
} from './ast';
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
} from "./type-errors";

// Type scheme for let-polymorphism
type TypeScheme = {
  type: Type;
  quantifiedVars: string[];
};

export type TypeEnvironment = Map<string, TypeScheme>;

// Type guard for type variables
function isTypeVariable(t: Type): t is { kind: "variable"; name: string } {
  return t.kind === "variable";
}

export class Typer {
  private environment: TypeEnvironment;
  private static globalTypeVariableCounter: number = 0;
  private substitution: Map<string, Type> = new Map(); // Track type variable bindings
  private currentlyDefining: Set<string> = new Set(); // Track variables being defined
  private typeVariableScopes: Map<string, Set<string>> = new Map(); // Track type variable scopes

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
  }

  private initializeBuiltins(): void {
    // Arithmetic operators (pure)
    this.environment.set("+", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });
    this.environment.set("-", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });
    this.environment.set("*", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });
    this.environment.set("/", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });

    // Comparison operators (pure)
    this.environment.set("==", {
      type: functionType([typeVariable("a"), typeVariable("a")], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("!=", {
      type: functionType([typeVariable("a"), typeVariable("a")], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("<", {
      type: functionType([intType(), intType()], boolType()),
      quantifiedVars: [],
    });
    this.environment.set(">", {
      type: functionType([intType(), intType()], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("<=", {
      type: functionType([intType(), intType()], boolType()),
      quantifiedVars: [],
    });
    this.environment.set(">=", {
      type: functionType([intType(), intType()], boolType()),
      quantifiedVars: [],
    });

    // List operations (pure)
    this.environment.set("head", {
      type: functionType(
        [listTypeWithElement(typeVariable("a"))],
        typeVariable("a")
      ),
      quantifiedVars: [],
    });
    this.environment.set("tail", {
      type: functionType(
        [listTypeWithElement(typeVariable("a"))],
        listTypeWithElement(typeVariable("a"))
      ),
      quantifiedVars: [],
    });
    this.environment.set("cons", {
      type: functionType(
        [typeVariable("a"), listTypeWithElement(typeVariable("a"))],
        listTypeWithElement(typeVariable("a"))
      ),
      quantifiedVars: [],
    });

    // Pipeline operator (pure)
    this.environment.set("|>", {
      type: functionType(
        [
          typeVariable("a"),
          functionType([typeVariable("a")], typeVariable("b")),
        ],
        typeVariable("b")
      ),
      quantifiedVars: [],
    });

    // Thrush operator (pure) - same as pipeline
    this.environment.set("|", {
      type: functionType(
        [
          typeVariable("a"),
          functionType([typeVariable("a")], typeVariable("b")),
        ],
        typeVariable("b")
      ),
      quantifiedVars: [],
    });

    // Semicolon operator (effectful - effects are unioned)
    this.environment.set(";", {
      type: functionType(
        [typeVariable("a"), typeVariable("b")],
        typeVariable("b")
      ),
      quantifiedVars: [],
    });

    // Dollar operator (low precedence function application)
    this.environment.set("$", {
      type: functionType(
        [
          functionType([typeVariable("a")], typeVariable("b")),
          typeVariable("a"),
        ],
        typeVariable("b")
      ),
      quantifiedVars: [],
    });

    // Effectful functions
    this.environment.set("print", {
      type: functionType([typeVariable("a")], typeVariable("a"), ["log"]),
      quantifiedVars: [],
    });

    // List utility functions (pure)
    this.environment.set("map", {
      type: functionType(
        [
          functionType([typeVariable("a")], typeVariable("b")),
          listTypeWithElement(typeVariable("a")),
        ],
        listTypeWithElement(typeVariable("b"))
      ),
      quantifiedVars: [],
    });
    this.environment.set("filter", {
      type: functionType(
        [
          functionType([typeVariable("a")], boolType()),
          listTypeWithElement(typeVariable("a")),
        ],
        listTypeWithElement(typeVariable("a"))
      ),
      quantifiedVars: [],
    });
    this.environment.set("reduce", {
      type: functionType(
        [
          functionType(
            [typeVariable("b"), typeVariable("a")],
            typeVariable("b")
          ),
          typeVariable("b"),
          listTypeWithElement(typeVariable("a")),
        ],
        typeVariable("b")
      ),
      quantifiedVars: [],
    });
    this.environment.set("length", {
      type: functionType([listTypeWithElement(typeVariable("a"))], intType()),
      quantifiedVars: [],
    });
    this.environment.set("isEmpty", {
      type: functionType([listTypeWithElement(typeVariable("a"))], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("append", {
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
    this.environment.set("abs", {
      type: functionType([intType()], intType()),
      quantifiedVars: [],
    });
    this.environment.set("max", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });
    this.environment.set("min", {
      type: functionType([intType(), intType()], intType()),
      quantifiedVars: [],
    });

    // String utilities (pure)
    this.environment.set("concat", {
      type: functionType([stringType(), stringType()], stringType()),
      quantifiedVars: [],
    });
    this.environment.set("toString", {
      type: functionType([typeVariable("a")], stringType()),
      quantifiedVars: [],
    });

    // Record utilities
    this.environment.set("hasKey", {
      type: functionType([recordType({}), stringType()], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("hasValue", {
      type: functionType([recordType({}), typeVariable("a")], boolType()),
      quantifiedVars: [],
    });
    this.environment.set("set", {
      type: functionType(
        [typeVariable("accessor"), recordType({}), typeVariable("a")],
        recordType({})
      ),
      quantifiedVars: [],
    });

    // Tuple operations - only keep sound ones
    this.environment.set(
      "tupleLength",
      { type: functionType([tupleType([])], intType()), quantifiedVars: [] } // Any tuple -> Int
    );
    this.environment.set(
      "tupleIsEmpty",
      { type: functionType([tupleType([])], boolType()), quantifiedVars: [] } // Any tuple -> Bool
    );
  }

  private freshTypeVariable(): Type {
    Typer.globalTypeVariableCounter++;
    return typeVariable(`α${Typer.globalTypeVariableCounter}`);
  }

  // Apply substitution to a type
  private substitute(type: Type): Type {
    switch (type.kind) {
      case "variable":
        const substitution = this.substitution.get(type.name);
        if (substitution) {
          return this.substitute(substitution); // Recursively substitute
        }
        return type;

      case "function":
        return {
          ...type,
          params: type.params.map((param) => this.substitute(param)),
          return: this.substitute(type.return),
        };

      case "list":
        return {
          ...type,
          element: this.substitute(type.element),
        };

      case "tuple":
        return {
          ...type,
          elements: type.elements.map((element) => this.substitute(element)),
        };

      case "record":
        const substitutedFields: { [key: string]: Type } = {};
        for (const [key, fieldType] of Object.entries(type.fields)) {
          substitutedFields[key] = this.substitute(fieldType);
        }
        return {
          ...type,
          fields: substitutedFields,
        };

      case "result":
        return {
          ...type,
          success: this.substitute(type.success),
          error: this.substitute(type.error),
        };

      case "option":
        return {
          ...type,
          element: this.substitute(type.element),
        };

      default:
        return type; // primitive, unit, unknown
    }
  }

  // Unify two types and update substitution
  private unify(t1: Type, t2: Type): boolean {
    // Apply current substitution to both types
    const s1 = this.substitute(t1);
    const s2 = this.substitute(t2);

    // If they're the same after substitution, we're done
    if (this.typesEqual(s1, s2)) {
      return true;
    }

    // Handle type variables
    if (s1.kind === "variable") {
      // Check for occurs check (prevent infinite recursion)
      if (this.occursIn(s1.name, s2)) {
        return false; // Occurs check failed
      }
      this.substitution.set(s1.name, s2);
      return true;
    }

    if (s2.kind === "variable") {
      if (this.occursIn(s2.name, s1)) {
        return false;
      }
      this.substitution.set(s2.name, s1);
      return true;
    }

    // Handle function types
    if (s1.kind === "function" && s2.kind === "function") {
      if (s1.params.length !== s2.params.length) {
        return false;
      }

      // Unify parameter types
      for (let i = 0; i < s1.params.length; i++) {
        if (!this.unify(s1.params[i], s2.params[i])) {
          return false;
        }
      }

      // Unify return types
      return this.unify(s1.return, s2.return);
    }

    // Handle list types
    if (s1.kind === "list" && s2.kind === "list") {
      return this.unify(s1.element, s2.element);
    }

    // Handle tuple types - more precise unification
    if (s1.kind === "tuple" && s2.kind === "tuple") {
      if (s1.elements.length !== s2.elements.length) {
        return false;
      }

      for (let i = 0; i < s1.elements.length; i++) {
        if (!this.unify(s1.elements[i], s2.elements[i])) {
          return false;
        }
      }
      return true;
    }

    // Handle tuple with type variable (for partial tuple types)
    if (s1.kind === "tuple" && isTypeVariable(s2)) {
      // Try to unify the type variable with the tuple
      return this.unify(s2, s1); // Swap and try again
    }

    if (s2.kind === "tuple" && isTypeVariable(s1)) {
      // Try to unify the type variable with the tuple
      return this.unify(s1, s2); // Swap and try again
    }

    // Special case: handle indexed tuple types
    // When we have a type variable that should be a tuple with specific constraints
    if (isTypeVariable(s1) && s2.kind === "tuple") {
      // This allows us to unify a type variable with a specific tuple structure
      return this.unify(s2, s1); // Swap and try again
    }

    if (isTypeVariable(s2) && s1.kind === "tuple") {
      return this.unify(s1, s2); // Swap and try again
    }

    // Handle record types (permissive - allows extra fields)
    if (s1.kind === "record" && s2.kind === "record") {
      const keys1 = Object.keys(s1.fields);
      const keys2 = Object.keys(s2.fields);

      // Check that all fields in s1 exist in s2 and have compatible types
      for (const key of keys1) {
        if (!s2.fields[key]) {
          return false; // Required field missing
        }
        if (!this.unify(s1.fields[key], s2.fields[key])) {
          return false; // Field type mismatch
        }
      }
      return true; // All required fields match, extra fields are allowed
    }

    // Handle primitive types
    if (s1.kind === "primitive" && s2.kind === "primitive") {
      return s1.name === s2.name;
    }

    // Handle unit types
    if (s1.kind === "unit" && s2.kind === "unit") {
      return true;
    }

    // Special case: allow unit, empty tuple, and empty record to unify
    const isEmptyTuple = (t: Type) =>
      t.kind === "tuple" && t.elements.length === 0;
    const isEmptyRecord = (t: Type) =>
      t.kind === "record" && Object.keys(t.fields).length === 0;
    const isUnit = (t: Type) => t.kind === "unit";

    if (
      (isUnit(s1) && (isEmptyTuple(s2) || isEmptyRecord(s2))) ||
      (isUnit(s2) && (isEmptyTuple(s1) || isEmptyRecord(s1))) ||
      (isEmptyTuple(s1) && isEmptyRecord(s2)) ||
      (isEmptyTuple(s2) && isEmptyRecord(s1))
    ) {
      return true;
    }

    // If we get here, types are incompatible
    return false;
  }

  // Check if a type variable occurs in a type (for occurs check)
  private occursIn(varName: string, type: Type): boolean {
    switch (type.kind) {
      case "variable":
        return type.name === varName;

      case "function":
        return (
          type.params.some((param) => this.occursIn(varName, param)) ||
          this.occursIn(varName, type.return)
        );

      case "list":
        return this.occursIn(varName, type.element);

      case "tuple":
        return type.elements.some((element) => this.occursIn(varName, element));

      case "record":
        return Object.values(type.fields).some((fieldType) =>
          this.occursIn(varName, fieldType)
        );

      case "result":
        return (
          this.occursIn(varName, type.success) ||
          this.occursIn(varName, type.error)
        );

      case "option":
        return this.occursIn(varName, type.element);

      default:
        return false; // primitive, unit, unknown
    }
  }

  // Check if two types are structurally equal
  private typesEqual(t1: Type, t2: Type): boolean {
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
          t1.params.every((param, i) => this.typesEqual(param, f2.params[i])) &&
          this.typesEqual(t1.return, f2.return)
        );

      case "list":
        return this.typesEqual(t1.element, (t2 as any).element);

      case "tuple":
        const t2_tuple = t2 as any;
        if (t1.elements.length !== t2_tuple.elements.length) {
          return false;
        }
        return t1.elements.every((element, i) =>
          this.typesEqual(element, t2_tuple.elements[i])
        );

      case "record":
        const t2_record = t2 as any;
        const keys1 = Object.keys(t1.fields);
        const keys2 = Object.keys(t2_record.fields);
        if (keys1.length !== keys2.length) {
          return false;
        }
        return keys1.every((key) =>
          this.typesEqual(t1.fields[key], t2_record.fields[key])
        );

      case "result":
        const t2_result = t2 as any;
        return (
          this.typesEqual(t1.success, t2_result.success) &&
          this.typesEqual(t1.error, t2_result.error)
        );

      case "option":
        return this.typesEqual(t1.element, (t2 as any).element);

      case "unit":
        return true;

      case "unknown":
        return true;

      default:
        return false;
    }
  }

  private extractEffects(type: Type): Effect[] {
    if (type.kind === "function") {
      return type.effects;
    }
    return [];
  }

  private unionEffects(effects1: Effect[], effects2: Effect[]): Effect[] {
    const union = new Set<Effect>([...effects1, ...effects2]);
    return Array.from(union);
  }

  private addEffectsToType(type: Type, effects: Effect[]): Type {
    if (effects.length === 0) {
      return type;
    }

    if (type.kind === "function") {
      return {
        ...type,
        effects: this.unionEffects(type.effects, effects),
      };
    }

    // For non-function types, just return the type as-is
    // Effects are only meaningful for functions, not for values
    return type;
  }

  typeProgram(program: Program): Type[] {
    const types: Type[] = [];

    for (const expr of program.statements) {
      // Type check the expression in the current environment
      const type = this.typeExpression(expr);
      types.push(type);

      // If this is a definition, it's already been added to the environment by typeDefinition
      // No need to do anything extra here
    }

    return types;
  }

  typeAndDecorate(program: Program): Program {
    // Type check and decorate each statement
    for (const statement of program.statements) {
      const type = this.typeExpression(statement);
      statement.type = type;
    }

    return program;
  }

  // Check if a type contains any type variables
  private hasTypeVariables(type: Type): boolean {
    switch (type.kind) {
      case "variable":
        return true;
      case "function":
        return (
          type.params.some((param) => this.hasTypeVariables(param)) ||
          this.hasTypeVariables(type.return)
        );
      case "list":
        return this.hasTypeVariables(type.element);
      case "tuple":
        return type.elements.some((element) => this.hasTypeVariables(element));
      case "record":
        return Object.values(type.fields).some((fieldType) =>
          this.hasTypeVariables(fieldType)
        );
      case "result":
        return (
          this.hasTypeVariables(type.success) ||
          this.hasTypeVariables(type.error)
        );
      case "option":
        return this.hasTypeVariables(type.element);
      default:
        return false; // primitive, unit, unknown
    }
  }

  // Collect all free type variables in a type
  private freeTypeVars(type: Type, acc: Set<string> = new Set()): Set<string> {
    switch (type.kind) {
      case "variable":
        acc.add(type.name);
        break;
      case "function":
        for (const param of type.params) this.freeTypeVars(param, acc);
        this.freeTypeVars(type.return, acc);
        break;
      case "list":
        this.freeTypeVars(type.element, acc);
        break;
      case "tuple":
        for (const el of type.elements) this.freeTypeVars(el, acc);
        break;
      case "record":
        for (const v of Object.values(type.fields)) this.freeTypeVars(v, acc);
        break;
      case "result":
        this.freeTypeVars(type.success, acc);
        this.freeTypeVars(type.error, acc);
        break;
      case "option":
        this.freeTypeVars(type.element, acc);
        break;
    }
    return acc;
  }

  // Collect all free type variables in the environment
  private freeTypeVarsEnv(env: TypeEnvironment): Set<string> {
    const acc = new Set<string>();
    for (const scheme of env.values()) {
      this.freeTypeVars(scheme.type, acc);
    }
    return acc;
  }

  // Generalize a type with respect to the environment
  private generalize(type: Type, env: TypeEnvironment): TypeScheme {
    const substitutedType = this.substitute(type);
    const typeVars = this.freeTypeVars(substitutedType);
    const envVars = this.freeTypeVarsEnv(env);
    const quantifiedVars: string[] = [];
    for (const varName of typeVars) {
      if (!envVars.has(varName)) {
        quantifiedVars.push(varName);
      }
    }
    return { type: substitutedType, quantifiedVars };
  }

  // Instantiate a type scheme by freshening all quantified variables
  private instantiate(scheme: TypeScheme): Type {
    const mapping = new Map<string, Type>();
    for (const varName of scheme.quantifiedVars) {
      mapping.set(varName, this.freshTypeVariable());
    }
    return this.freshenTypeVariables(scheme.type, mapping);
  }

  // Replace type variables with universally quantified versions
  private replaceTypeVariables(
    type: Type,
    generalizableVars: Set<string>
  ): Type {
    switch (type.kind) {
      case "variable":
        if (generalizableVars.has(type.name)) {
          // Mark as universally quantified by using a special name
          return { ...type, name: `∀${type.name}` };
        }
        return type;
      case "function":
        return {
          ...type,
          params: type.params.map((param) =>
            this.replaceTypeVariables(param, generalizableVars)
          ),
          return: this.replaceTypeVariables(type.return, generalizableVars),
        };
      case "list":
        return {
          ...type,
          element: this.replaceTypeVariables(type.element, generalizableVars),
        };
      case "tuple":
        return {
          ...type,
          elements: type.elements.map((el) =>
            this.replaceTypeVariables(el, generalizableVars)
          ),
        };
      case "record":
        const newFields: { [key: string]: Type } = {};
        for (const [key, fieldType] of Object.entries(type.fields)) {
          newFields[key] = this.replaceTypeVariables(
            fieldType,
            generalizableVars
          );
        }
        return { ...type, fields: newFields };
      case "result":
        return {
          ...type,
          success: this.replaceTypeVariables(type.success, generalizableVars),
          error: this.replaceTypeVariables(type.error, generalizableVars),
        };
      case "option":
        return {
          ...type,
          element: this.replaceTypeVariables(type.element, generalizableVars),
        };
      default:
        return type;
    }
  }

  private typeDefinition(def: DefinitionExpression): void {
    // Insert a placeholder type variable for recursion
    const placeholderType = this.freshTypeVariable();
    this.environment.set(def.name, {
      type: placeholderType,
      quantifiedVars: [],
    });
    this.currentlyDefining.add(def.name);
    const type = this.typeExpression(def.value);
    this.currentlyDefining.delete(def.name);
    // Unify the placeholder with the actual type for recursion
    this.unify(placeholderType, type);

    // Create a temporary environment without the placeholder for generalization
    const tempEnv = new Map(this.environment);
    tempEnv.delete(def.name);

    // Generalize the type before storing in the environment
    const scheme = this.generalize(type, tempEnv);
    this.environment.set(def.name, scheme);
  }

  typeExpression(expr: Expression): Type {
    let type: Type;

    switch (expr.kind) {
      case "literal":
        type = this.typeLiteral(expr);
        break;

      case "variable":
        type = this.typeVariable(expr);
        break;

      case "function":
        type = this.typeFunction(expr);
        break;

      case "application":
        type = this.typeApplication(expr);
        break;

      case "pipeline":
        type = this.typePipeline(expr);
        break;

      case "binary":
        type = this.typeBinary(expr);
        break;

      case "if":
        type = this.typeIf(expr);
        break;

      case "definition":
        this.typeDefinition(expr);
        type = this.typeExpression(expr.value); // Return the type of the value
        break;

      case "mutable-definition":
        // Handle mutable definitions similar to regular definitions
        const mutableType = this.typeExpression(expr.value);
        this.environment.set(expr.name, {
          type: mutableType,
          quantifiedVars: [],
        });
        type = mutableType; // Return the type of the value
        break;

      case "mutation":
        // For mutations, we need to check that the target exists and the value type matches
        const targetType = this.environment.get(expr.target);
        if (!targetType) {
          const error = undefinedVariableError(expr.target, {
            line: expr.location?.start.line || 1,
            column: expr.location?.start.column || 1,
          });
          throw new Error(formatTypeError(error));
        }
        const valueType = this.typeExpression(expr.value);
        if (!this.unify(targetType.type, valueType)) {
          const error = mutationTypeError(
            targetType.type,
            valueType,
            expr.target,
            {
              line: expr.location?.start.line || 1,
              column: expr.location?.start.column || 1,
            }
          );
          throw new Error(formatTypeError(error));
        }
        type = unitType(); // Mutations return unit
        break;

      case "import":
        type = this.typeImport(expr);
        break;

      case "record":
        type = this.typeRecord(expr);
        break;

      case "accessor":
        type = this.typeAccessor(expr);
        break;

      case "list":
        type = this.typeList(expr);
        break;

      case "tuple":
        type = this.typeTuple(expr);
        break;

      case "where":
        type = this.typeWhere(expr);
        break;

      case "unit":
        type = unitType();
        break;

      case "typed":
        // For typed expressions, validate that the explicit type matches the inferred type
        const inferredType = this.typeExpression(expr.expression);
        const explicitType = expr.type;

        if (!this.unify(inferredType, explicitType)) {
          const error = typeAnnotationError(explicitType, inferredType, {
            line: expr.location?.start.line || 1,
            column: expr.location?.start.column || 1,
          });
          throw new Error(formatTypeError(error));
        }

        type = explicitType; // Use the explicit type
        break;

      default:
        throw new Error(
          `Unknown expression kind: ${(expr as Expression).kind}`
        );
    }

    // Apply substitution to get the most specific type
    const resolvedType = this.substitute(type);

    // Decorate the expression with its resolved type
    expr.type = resolvedType;
    return resolvedType;
  }

  private typeLiteral(expr: LiteralExpression): Type {
    const value = expr.value;

    if (typeof value === "number") {
      return intType();
    } else if (typeof value === "string") {
      return stringType();
    } else if (typeof value === "boolean") {
      return boolType();
    } else if (Array.isArray(value)) {
      // For now, assume all lists have Int elements
      // In a more sophisticated system, we'd infer the element type
      return listTypeWithElement(intType());
    } else {
      return unknownType();
    }
  }

  // Replace all type variables in a type with fresh ones (instantiation)
  private freshenTypeVariables(
    type: Type,
    mapping: Map<string, Type> = new Map()
  ): Type {
    switch (type.kind) {
      case "variable":
        // Check if this is a universally quantified variable (∀ prefix)
        if (type.name.startsWith("∀")) {
          // Always create a fresh variable for universally quantified types
          const baseName = type.name.slice(1); // Remove the ∀ prefix
          if (!mapping.has(baseName)) {
            mapping.set(baseName, this.freshTypeVariable());
          }
          return mapping.get(baseName)!;
        } else {
          // Regular type variable - use existing mapping or create new
          if (!mapping.has(type.name)) {
            mapping.set(type.name, this.freshTypeVariable());
          }
          return mapping.get(type.name)!;
        }
      case "function":
        return {
          ...type,
          params: type.params.map((param) =>
            this.freshenTypeVariables(param, mapping)
          ),
          return: this.freshenTypeVariables(type.return, mapping),
          effects: type.effects,
        };
      case "list":
        return {
          ...type,
          element: this.freshenTypeVariables(type.element, mapping),
        };
      case "tuple":
        return {
          ...type,
          elements: type.elements.map((el) =>
            this.freshenTypeVariables(el, mapping)
          ),
        };
      case "record":
        const newFields: { [key: string]: Type } = {};
        for (const [k, v] of Object.entries(type.fields)) {
          newFields[k] = this.freshenTypeVariables(v, mapping);
        }
        return { ...type, fields: newFields };
      case "result":
        return {
          ...type,
          success: this.freshenTypeVariables(type.success, mapping),
          error: this.freshenTypeVariables(type.error, mapping),
        };
      case "option":
        return {
          ...type,
          element: this.freshenTypeVariables(type.element, mapping),
        };
      default:
        return type;
    }
  }

  private typeVariable(expr: VariableExpression): Type {
    const scheme = this.environment.get(expr.name);
    if (scheme === undefined) {
      const error = undefinedVariableError(expr.name, {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      });
      throw new Error(formatTypeError(error));
    }
    // If we're currently defining this variable (recursion), return the type directly
    // but allow type variables to be unified properly
    if (this.currentlyDefining.has(expr.name)) {
      // For recursive calls, we want to allow the type variables to be unified
      // but we don't want to freshen them, as that would break the connection
      // However, we need to ensure that the recursive call can use fresh type variables
      // that can be unified with the outer function's type variables
      return scheme.type;
    }
    // For local parameters (no quantified variables), return the type directly
    // This ensures that function parameters maintain their identity
    if (scheme.quantifiedVars.length === 0) {
      return scheme.type;
    }
    // Otherwise, instantiate the type scheme with fresh type variables
    return this.instantiate(scheme);
  }

  private typeFunction(expr: FunctionExpression): Type {
    // Create new type environment for function scope
    const functionEnv = new Map(this.environment);

    let paramTypes: Type[] = [];
    if (expr.params.length === 0) {
      // Treat as a function from unit to return type
      paramTypes = [unitType()];
      functionEnv.set("_unit", { type: unitType(), quantifiedVars: [] });
    } else {
      // Assign fresh type variables to parameters
      for (const param of expr.params) {
        const paramType = this.freshTypeVariable();
        paramTypes.push(paramType);
        functionEnv.set(param, { type: paramType, quantifiedVars: [] });
      }
    }

    // Save the current environment
    const oldEnv = this.environment;

    // Switch to the function environment
    this.environment = functionEnv;

    // Type the function body
    const returnType = this.typeExpression(expr.body);

    // Restore the original environment
    this.environment = oldEnv;

    // Apply substitutions to the parameter types and return type
    const resolvedParamTypes = paramTypes.map((param) =>
      this.substitute(param)
    );
    const resolvedReturnType = this.substitute(returnType);

    // Create a curried function type: t1 -> t2 -> t3 -> ... -> returnType
    let curriedType = resolvedReturnType;
    for (let i = resolvedParamTypes.length - 1; i >= 0; i--) {
      curriedType = functionType([resolvedParamTypes[i]], curriedType);
    }

    return curriedType;
  }

  private typeApplication(expr: ApplicationExpression): Type {
    // Evaluate the function value
    let funcType = this.typeExpression(expr.func);
    funcType = this.substitute(funcType);

    const argTypes = expr.args.map((arg: Expression) =>
      this.typeExpression(arg)
    );

    if (funcType.kind === "function") {
      if (argTypes.length > funcType.params.length) {
        throw new Error(
          `Expected at most ${funcType.params.length} arguments, got ${argTypes.length}`
        );
      }
      for (let i = 0; i < argTypes.length; i++) {
        if (!this.unify(funcType.params[i], argTypes[i])) {
          const error = functionApplicationError(
            funcType.params[i],
            argTypes[i],
            i,
            undefined, // functionName could be extracted from expr.func if needed
            {
              line: expr.location?.start.line || 1,
              column: expr.location?.start.column || 1,
            }
          );
          throw new Error(formatTypeError(error));
        }
      }
      const resolvedReturnType = this.substitute(funcType.return);
      if (argTypes.length === funcType.params.length) {
        return this.addEffectsToType(resolvedReturnType, funcType.effects);
      } else {
        const remainingParams = funcType.params.slice(argTypes.length);
        const partialFunctionType = functionType(
          remainingParams,
          resolvedReturnType,
          funcType.effects
        );
        // Freshen type variables for partial application result
        return this.freshenTypeVariables(this.substitute(partialFunctionType));
      }
    } else if (funcType.kind === "variable") {
      // Simple case: if it's a type variable, create a function type and unify
      if (argTypes.length === 0) {
        return funcType;
      }
      const paramType = this.freshTypeVariable();
      const returnType = this.freshTypeVariable();
      const freshFunctionType = functionType([paramType], returnType);
      if (!this.unify(funcType, freshFunctionType)) {
        throw new Error(`Cannot unify type variable with function type`);
      }
      if (!this.unify(paramType, argTypes[0])) {
        throw new Error(
          `Type mismatch: expected ${this.typeToString(
            paramType
          )}, got ${this.typeToString(argTypes[0])}`
        );
      }
      return this.substitute(returnType);
    } else {
      const error = nonFunctionApplicationError(funcType, {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      });
      throw new Error(formatTypeError(error));
    }
  }

  private typePipeline(expr: PipelineExpression): Type {
    // Pipeline should be function composition, not function application
    // For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))

    if (expr.steps.length === 1) {
      return this.typeExpression(expr.steps[0]);
    }

    // Start with the first function type
    let composedType = this.typeExpression(expr.steps[0]);

    // Compose with each subsequent function type
    for (let i = 1; i < expr.steps.length; i++) {
      const nextFuncType = this.typeExpression(expr.steps[i]);

      if (
        composedType.kind === "function" &&
        nextFuncType.kind === "function"
      ) {
        // Check that the output of composedType matches the input of nextFuncType
        if (nextFuncType.params.length !== 1) {
          throw new Error(`Pipeline function must take exactly one argument`);
        }

        if (!this.unify(composedType.return, nextFuncType.params[0])) {
          const error = pipelineCompositionError(
            composedType.return,
            nextFuncType.params[0],
            {
              line: expr.location?.start.line || 1,
              column: expr.location?.start.column || 1,
            }
          );
          throw new Error(formatTypeError(error));
        }

        // The composed function takes the input of the first function and returns the output of the last function
        composedType = functionType(
          [composedType.params[0]],
          nextFuncType.return
        );
      } else {
        throw new Error(
          `Cannot compose non-function types in pipeline: ${this.typeToString(
            composedType
          )} and ${this.typeToString(nextFuncType)}`
        );
      }
    }

    return this.substitute(composedType);
  }

  private typeBinary(expr: BinaryExpression): Type {
    const leftType = this.typeExpression(expr.left);
    const rightType = this.typeExpression(expr.right);

    // Special handling for semicolon sequences (effect union)
    if (expr.operator === ";") {
      // For sequences: type is rightmost expression, effects are union of all expressions
      const leftEffects = this.extractEffects(leftType);
      const rightEffects = this.extractEffects(rightType);
      const unionEffects = this.unionEffects(leftEffects, rightEffects);

      // Apply substitution to get the most specific type
      const resolvedRightType = this.substitute(rightType);

      // Return rightmost type with unioned effects
      return this.addEffectsToType(resolvedRightType, unionEffects);
    }

    // Special handling for thrush operator (|) - treat as function application
    if (expr.operator === "|") {
      // Thrush: a | b means b(a) - apply right function to left value
      if (rightType.kind !== "function") {
        throw new Error(
          `Thrush operator requires function on right side, got ${this.typeToString(
            rightType
          )}`
        );
      }

      // Check that the function can take the left value as an argument
      if (rightType.params.length !== 1) {
        throw new Error(
          `Thrush operator requires function with exactly one parameter, got ${rightType.params.length}`
        );
      }

      if (!this.unify(rightType.params[0], leftType)) {
        throw new Error(
          `Thrush type mismatch: function expects ${this.typeToString(
            rightType.params[0]
          )}, got ${this.typeToString(leftType)}`
        );
      }

      // Return the function's return type
      return this.substitute(rightType.return);
    }

    // Special handling for dollar operator ($) - treat as function application
    if (expr.operator === "$") {
      // Dollar: a $ b means a(b) - apply left function to right value
      if (leftType.kind !== "function") {
        throw new Error(
          `Dollar operator requires function on left side, got ${this.typeToString(
            leftType
          )}`
        );
      }

      // Check that the function can take the right value as an argument
      if (leftType.params.length !== 1) {
        throw new Error(
          `Dollar operator requires function with exactly one parameter, got ${leftType.params.length}`
        );
      }

      if (!this.unify(leftType.params[0], rightType)) {
        throw new Error(
          `Dollar type mismatch: function expects ${this.typeToString(
            leftType.params[0]
          )}, got ${this.typeToString(rightType)}`
        );
      }

      // Return the function's return type
      return this.substitute(leftType.return);
    }

    // Get the operator's type from environment
    const operatorType = this.environment.get(expr.operator);
    if (!operatorType || operatorType.type.kind !== "function") {
      throw new Error(`Unknown operator: ${expr.operator}`);
    }

    // Check argument types
    if (operatorType.type.params.length !== 2) {
      throw new Error(`Binary operator must take exactly two arguments`);
    }

    if (!this.unify(operatorType.type.params[0], leftType)) {
      const error = operatorTypeError(
        expr.operator,
        operatorType.type.params[0],
        leftType,
        {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        }
      );
      throw new Error(formatTypeError(error));
    }

    if (!this.unify(operatorType.type.params[1], rightType)) {
      const error = operatorTypeError(
        expr.operator,
        operatorType.type.params[1],
        rightType,
        {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        }
      );
      throw new Error(formatTypeError(error));
    }

    // Apply substitution to get the resolved return type
    return this.substitute(operatorType.type.return);
  }

  private typeIf(expr: IfExpression): Type {
    const conditionType = this.typeExpression(expr.condition);
    const thenType = this.typeExpression(expr.then);
    const elseType = this.typeExpression(expr.else);

    // Condition should be boolean
    if (conditionType.kind !== "primitive" || conditionType.name !== "Bool") {
      const error = conditionTypeError(conditionType, {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      });
      throw new Error(formatTypeError(error));
    }

    // Then and else branches should have compatible types
    if (!this.unify(thenType, elseType)) {
      const error = ifBranchTypeError(thenType, elseType, {
        line: expr.location?.start.line || 1,
        column: expr.location?.start.column || 1,
      });
      throw new Error(formatTypeError(error));
    }

    // Apply substitution to get the resolved type
    return this.substitute(thenType);
  }

  private typeImport(expr: any): Type {
    // For now, assume imports return a record type
    return recordType({});
  }

  private typeRecord(expr: any): Type {
    const fields: { [key: string]: Type } = {};
    for (const field of expr.fields) {
      fields[field.name] = this.typeExpression(field.value);
    }
    return recordType(fields);
  }

  private typeWhere(expr: any): Type {
    // Create a new type environment with the where-clause definitions
    const whereEnv = new Map(this.environment);

    // Type all definitions in the where clause
    for (const def of expr.definitions) {
      if (def.kind === "definition") {
        const valueType = this.typeExpression(def.value);
        // Generalize with respect to the current whereEnv (excluding the new binding)
        const tempEnv = new Map(whereEnv);
        tempEnv.delete(def.name);
        const scheme = this.generalize(valueType, tempEnv);
        whereEnv.set(def.name, scheme);
      }
    }

    // Save the current environment
    const oldEnv = this.environment;

    // Switch to the where environment
    this.environment = whereEnv;

    // Type the main expression
    const resultType = this.typeExpression(expr.main);

    // Restore the original environment
    this.environment = oldEnv;

    return resultType;
  }

  private typeAccessor(expr: any): Type {
    // Accessors return functions that take any record with the required field and return the field type
    // @bar should have type {bar: a, ...} -> a (allows extra fields)
    const fieldName = expr.field;
    const fieldType = typeVariable("a");
    // Create a more specific record type that includes the required field
    const recordTypeValue = recordType({ [fieldName]: fieldType });
    return functionType([recordTypeValue], fieldType);
  }

  private typeTuple(expr: any): Type {
    const elements = expr.elements.map((element: any) =>
      this.typeExpression(element)
    );
    return tupleType(elements);
  }

  private typeList(expr: any): Type {
    if (expr.elements.length === 0) {
      // Empty list - we can't infer the element type
      return listTypeWithElement(typeVariable("a"));
    }

    // Infer the type from the first element
    const firstElementType = this.typeExpression(expr.elements[0]);

    // Check that all elements have the same type
    for (let i = 1; i < expr.elements.length; i++) {
      const elementType = this.typeExpression(expr.elements[i]);
      if (!this.unify(firstElementType, elementType)) {
        const error = listElementTypeError(firstElementType, elementType, {
          line: expr.location?.start.line || 1,
          column: expr.location?.start.column || 1,
        });
        throw new Error(formatTypeError(error));
      }
    }

    // Apply substitution to get the resolved element type
    const resolvedElementType = this.substitute(firstElementType);
    return listTypeWithElement(resolvedElementType);
  }

  private typesCompatible(t1: Type, t2: Type): boolean {
    // Simple type compatibility check
    // In a real system, this would be more sophisticated with unification

    if (t1.kind === "unknown" || t2.kind === "unknown") {
      return true;
    }

    if (t1.kind === "variable" || t2.kind === "variable") {
      return true; // Type variables are compatible with anything
    }

    if (t1.kind === "primitive" && t2.kind === "primitive") {
      return t1.name === t2.name;
    }

    if (t1.kind === "function" && t2.kind === "function") {
      if (t1.params.length !== t2.params.length) {
        return false;
      }

      for (let i = 0; i < t1.params.length; i++) {
        if (!this.typesCompatible(t1.params[i], t2.params[i])) {
          return false;
        }
      }

      return this.typesCompatible(t1.return, t2.return);
    }

    if (t1.kind === "list" && t2.kind === "list") {
      return this.typesCompatible(t1.element, t2.element);
    }

    if (t1.kind === "tuple" && t2.kind === "tuple") {
      if (t1.elements.length !== t2.elements.length) {
        return false;
      }

      for (let i = 0; i < t1.elements.length; i++) {
        if (!this.typesCompatible(t1.elements[i], t2.elements[i])) {
          return false;
        }
      }

      return true;
    }

    if (t1.kind === "record" && t2.kind === "record") {
      const t1Keys = Object.keys(t1.fields);
      const t2Keys = Object.keys(t2.fields);

      if (t1Keys.length !== t2Keys.length) {
        return false;
      }

      for (const key of t1Keys) {
        if (!t2.fields[key]) {
          return false;
        }

        if (!this.typesCompatible(t1.fields[key], t2.fields[key])) {
          return false;
        }
      }

      return true;
    }

    if (t1.kind === "result" && t2.kind === "result") {
      return (
        this.typesCompatible(t1.success, t2.success) &&
        this.typesCompatible(t1.error, t2.error)
      );
    }

    if (t1.kind === "option" && t2.kind === "option") {
      return this.typesCompatible(t1.element, t2.element);
    }

    if (t1.kind === "unit" && t2.kind === "unit") {
      return true;
    }

    return false;
  }

  typeToString(type: Type): string {
    // Normalize type variable names for display
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
        case "result":
          return `Result ${norm(t.success)} ${norm(t.error)}`;
        case "option":
          return `Option ${norm(t.element)}`;
        case "unit":
          return "unit";
        case "unknown":
          return "?";
        default:
          return "unknown";
      }
    }
    // Start normalization with a fresh mapping for each call
    return norm(this.substitute(type));
  }

  // Get the current type environment (useful for debugging)
  getTypeEnvironment(): TypeEnvironment {
    return new Map(this.environment);
  }

  // Print the current type environment in a readable format
  printTypeEnvironment(program: Program): void {
    console.log("Global Type Environment:");
    for (const [name, scheme] of Array.from(this.environment.entries())) {
      console.log(`  ${name}: ${this.typeToString(scheme.type)}`);
    }

    console.log("\nLocal Type Environment (after typing):");
    for (const [name, scheme] of Array.from(this.environment.entries())) {
      console.log(`  ${name}: ${this.typeToString(scheme.type)}`);
    }
  }
}