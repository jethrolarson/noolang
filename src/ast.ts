// AST types for Noolang

export type Position = {
  line: number;
  column: number;
};

export type Location = {
  start: Position;
  end: Position;
};

// Type system
export type Effect = "io" | "log" | "mut" | "rand" | "err";

// Type constraints for constrained polymorphism
export type Constraint =
  | { kind: "is"; typeVar: string; constraint: string } // a is Collection
  | { kind: "hasField"; typeVar: string; field: string; fieldType: Type } // a has field "length" of type Int
  | { kind: "implements"; typeVar: string; interfaceName: string } // a implements Show
  | { kind: "custom"; typeVar: string; constraint: string; args: Type[] }; // a satisfies MyConstraint T1 T2

export type ConstraintExpr =
  | Constraint
  | { kind: "and"; left: ConstraintExpr; right: ConstraintExpr }
  | { kind: "or"; left: ConstraintExpr; right: ConstraintExpr }
  | { kind: "paren"; expr: ConstraintExpr };

export type Type =
  | { kind: "primitive"; name: "Int" | "String" | "Bool" | "List" }
  | {
      kind: "function";
      params: Type[];
      return: Type;
      effects: Effect[];
      constraints?: Constraint[];
    }
  | { kind: "variable"; name: string; constraints?: Constraint[] }
  | { kind: "list"; element: Type }
  | { kind: "tuple"; elements: Type[] }
  | { kind: "record"; fields: { [key: string]: Type } }
  | { kind: "union"; types: Type[] }
  | { kind: "variant"; name: string; args: Type[] } // ADT instance like Option Int or Result String Int
  | {
      kind: "adt";
      name: string;
      typeParams: string[];
      constructors: ConstructorDefinition[];
    } // ADT definition
  | { kind: "unit" }
  | { kind: "unknown" };

// Expressions
export type Expression =
  | LiteralExpression
  | VariableExpression
  | FunctionExpression
  | ApplicationExpression
  | PipelineExpression
  | BinaryExpression
  | IfExpression
  | DefinitionExpression
  | MutableDefinitionExpression
  | MutationExpression
  | ImportExpression
  | RecordExpression
  | TupleExpression
  | UnitExpression
  | AccessorExpression
  | TypedExpression
  | ConstrainedExpression
  | ListExpression
  | WhereExpression
  | TypeDefinitionExpression
  | MatchExpression;

export interface LiteralExpression {
  kind: "literal";
  value: number | string | boolean | Expression[] | null; // null represents unit
  type?: Type;
  location: Location;
}

export interface VariableExpression {
  kind: "variable";
  name: string;
  type?: Type;
  location: Location;
}

export interface FunctionExpression {
  kind: "function";
  params: string[];
  body: Expression;
  type?: Type;
  location: Location;
}

export interface ApplicationExpression {
  kind: "application";
  func: Expression;
  args: Expression[];
  type?: Type;
  location: Location;
}

export interface PipelineExpression {
  kind: "pipeline";
  steps: Expression[];
  type?: Type;
  location: Location;
}

export interface BinaryExpression {
  kind: "binary";
  operator:
    | "+"
    | "-"
    | "*"
    | "/"
    | "=="
    | "!="
    | "<"
    | ">"
    | "<="
    | ">="
    | "|"
    | "|>"
    | "<|"
    | ";"
    | "$";
  left: Expression;
  right: Expression;
  type?: Type;
  location: Location;
}

export interface IfExpression {
  kind: "if";
  condition: Expression;
  then: Expression;
  else: Expression;
  type?: Type;
  location: Location;
}

export interface DefinitionExpression {
  kind: "definition";
  name: string;
  value: Expression;
  type?: Type;
  location: Location;
}

export interface MutableDefinitionExpression {
  kind: "mutable-definition";
  name: string;
  value: Expression;
  type?: Type;
  location: Location;
}

export interface MutationExpression {
  kind: "mutation";
  target: string;
  value: Expression;
  type?: Type;
  location: Location;
}

export interface ImportExpression {
  kind: "import";
  path: string;
  type?: Type;
  location: Location;
}

export interface RecordExpression {
  kind: "record";
  fields: { name: string; value: Expression }[];
  type?: Type;
  location: Location;
}

export interface AccessorExpression {
  kind: "accessor";
  field: string;
  type?: Type;
  location: Location;
}

export interface TupleExpression {
  kind: "tuple";
  elements: Expression[];
  type?: Type;
  location: Location;
}

export interface UnitExpression {
  kind: "unit";
  type?: Type;
  location: Location;
}

export interface TypedExpression {
  kind: "typed";
  expression: Expression;
  type: Type;
  location: Location;
}

export interface ConstrainedExpression {
  kind: "constrained";
  expression: Expression;
  type: Type;
  constraint: ConstraintExpr;
  location: Location;
}

export interface ListExpression {
  kind: "list";
  elements: Expression[];
  type?: Type;
  location: Location;
}

export interface WhereExpression {
  kind: "where";
  main: Expression;
  definitions: (DefinitionExpression | MutableDefinitionExpression)[];
  type?: Type;
  location: Location;
}

// ADT Constructor definition
export interface ConstructorDefinition {
  name: string;
  args: Type[];
  location: Location;
}

// ADT Type definition
export interface TypeDefinitionExpression {
  kind: "type-definition";
  name: string;
  typeParams: string[]; // Type parameters like 'a' in Option a
  constructors: ConstructorDefinition[];
  type?: Type;
  location: Location;
}

// Pattern in pattern matching
export type Pattern =
  | { kind: "constructor"; name: string; args: Pattern[]; location: Location }
  | { kind: "variable"; name: string; location: Location }
  | { kind: "literal"; value: number | string | boolean; location: Location }
  | { kind: "wildcard"; location: Location };

// Pattern matching case
export interface MatchCase {
  pattern: Pattern;
  expression: Expression;
  location: Location;
}

// Match expression
export interface MatchExpression {
  kind: "match";
  expression: Expression;
  cases: MatchCase[];
  type?: Type;
  location: Location;
}

// Top-level constructs
export type TopLevel = Expression;

// Program
export interface Program {
  statements: TopLevel[];
  location: Location;
}

// Utility functions
export const createLocation = (start: Position, end: Position): Location => ({
  start,
  end,
});

export const createPosition = (line: number, column: number): Position => ({
  line,
  column,
});

// Type constructors
export const intType = (): Type => ({ kind: "primitive", name: "Int" });
export const numberType = (): Type => ({ kind: "primitive", name: "Int" }); // Alias for backwards compatibility
export const stringType = (): Type => ({ kind: "primitive", name: "String" });
export const boolType = (): Type => ({
  kind: "variant",
  name: "Bool",
  args: [],
});
export const listType = (): Type => ({ kind: "primitive", name: "List" });
export const functionType = (
  params: Type[],
  returnType: Type,
  effects: Effect[] = [],
): Type => ({
  kind: "function",
  params,
  return: returnType,
  effects,
});
export const typeVariable = (name: string): Type => ({
  kind: "variable",
  name,
});
export const unknownType = (): Type => ({ kind: "unknown" });

// New type constructors
export const listTypeWithElement = (element: Type): Type => ({
  kind: "list",
  element,
});
export const tupleType = (elements: Type[]): Type => ({
  kind: "tuple",
  elements,
});

// Add tuple type constructor for Tuple T1 T2 syntax
export const tupleTypeConstructor = (elementTypes: Type[]): Type => ({
  kind: "tuple",
  elements: elementTypes,
});

export const recordType = (fields: { [key: string]: Type }): Type => ({
  kind: "record",
  fields,
});

// Helper functions to create ADT variant types
export const optionType = (element: Type): Type => ({
  kind: "variant",
  name: "Option",
  args: [element],
});

export const resultType = (success: Type, error: Type): Type => ({
  kind: "variant",
  name: "Result",
  args: [success, error],
});

// Convenience functions for common types
export const unitType = (): Type => ({ kind: "unit" });
export const unionType = (types: Type[]): Type => ({ kind: "union", types });
export const optionInt = (): Type => optionType(intType());
export const resultString = (error: Type): Type =>
  resultType(stringType(), error);

// Constraint helper functions
export const isConstraint = (
  typeVar: string,
  constraint: string,
): Constraint => ({
  kind: "is",
  typeVar,
  constraint,
});

export const hasFieldConstraint = (
  typeVar: string,
  field: string,
  fieldType: Type,
): Constraint => ({
  kind: "hasField",
  typeVar,
  field,
  fieldType,
});

export const implementsConstraint = (
  typeVar: string,
  interfaceName: string,
): Constraint => ({
  kind: "implements",
  typeVar,
  interfaceName,
});

export const customConstraint = (
  typeVar: string,
  constraint: string,
  args: Type[],
): Constraint => ({
  kind: "custom",
  typeVar,
  constraint,
  args,
});

// Constrained type variable
export const constrainedTypeVariable = (
  name: string,
  constraints: Constraint[],
): Type => ({
  kind: "variable",
  name,
  constraints,
});

// Constrained function type
export const constrainedFunctionType = (
  params: Type[],
  returnType: Type,
  effects: Effect[] = [],
  constraints: Constraint[] = [],
): Type => ({
  kind: "function",
  params,
  return: returnType,
  effects,
  constraints,
});
