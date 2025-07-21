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
export type Effect = "log" | "read" | "write" | "state" | "time" | "rand" | "ffi" | "async";

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

// Extracted type definitions
export type PrimitiveType = {
  kind: "primitive";
  name: "Int" | "String" | "Bool" | "List";
};

export type FunctionType = {
  kind: "function";
  params: Type[];
  return: Type;
  effects: Set<Effect>;
  constraints?: Constraint[];
};

export type VariableType = {
  kind: "variable";
  name: string;
  constraints?: Constraint[];
};

export type ListType = {
  kind: "list";
  element: Type;
};

export type UnionType = {
  kind: "union";
  types: Type[];
};

export type VariantType = {
  kind: "variant";
  name: string;
  args: Type[];
};

export type ADTType = {
  kind: "adt";
  name: string;
  typeParams: string[];
  constructors: ConstructorDefinition[];
};

export type UnitType = {
  kind: "unit";
};

export type UnknownType = {
  kind: "unknown";
};

export type Type =
  | PrimitiveType
  | FunctionType
  | VariableType
  | ListType
  | TupleType
  | RecordType
  | UnionType
  | VariantType
  | ADTType
  | UnitType
  | UnknownType;

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
  | MatchExpression
  | ConstraintDefinitionExpression
  | ImplementDefinitionExpression;

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
    | "|?"
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

export type RecordExpression = {
	kind: "record";
	fields: FieldExpression[];
	type?: Type;
	location: Location;
};

export interface FieldExpression {
	name: string;
	value: Expression;
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

// Constraint definition for trait system
export interface ConstraintDefinitionExpression {
  kind: "constraint-definition";
  name: string;
  typeParam: string;
  functions: ConstraintFunction[];
  type?: Type;
  location: Location;
}

export interface ConstraintFunction {
  name: string;
  typeParams: string[];
  type: Type;
  location: Location;
}

// Implement definition for trait system
export interface ImplementDefinitionExpression {
  kind: "implement-definition";
  constraintName: string;
  typeName: string;
  implementations: ImplementationFunction[];
  type?: Type;
  location: Location;
}

export interface ImplementationFunction {
  name: string;
  value: Expression;
  location: Location;
}

// Program
export interface Program {
  statements: Expression[];
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
export const intType = (): PrimitiveType => ({
  kind: "primitive",
  name: "Int",
});
export const numberType = (): PrimitiveType => ({
  kind: "primitive",
  name: "Int",
}); // Alias for backwards compatibility
export const stringType = (): PrimitiveType => ({
  kind: "primitive",
  name: "String",
});
export const boolType = (): VariantType => ({
  kind: "variant",
  name: "Bool",
  args: [],
});
export const listType = (): PrimitiveType => ({
  kind: "primitive",
  name: "List",
});
export const functionType = (
  params: Type[],
  returnType: Type,
  effects: Set<Effect> = new Set()
): FunctionType => ({
  kind: "function",
  params,
  return: returnType,
  effects,
});
export const typeVariable = (name: string): VariableType => ({
  kind: "variable",
  name,
});
export const unknownType = (): UnknownType => ({ kind: "unknown" });

// New type constructors
export const listTypeWithElement = (element: Type): ListType => ({
  kind: "list",
  element,
});

export type TupleType = {
  kind: "tuple";
  elements: Type[];
};

export const tupleType = (elements: Type[]): TupleType => ({
  kind: "tuple",
  elements,
});

// Add tuple type constructor for Tuple T1 T2 syntax
export const tupleTypeConstructor = (elementTypes: Type[]): TupleType => ({
  kind: "tuple",
  elements: elementTypes,
});

export type RecordType = {
  kind: "record";
  fields: { [key: string]: Type };
};

export const recordType = (fields: { [key: string]: Type }): RecordType => ({
  kind: "record",
  fields,
});

// Constructor functions for new types
export const primitiveType = (
  name: "Int" | "String" | "Bool" | "List"
): PrimitiveType => ({
  kind: "primitive",
  name,
});


export const variableType = (
  name: string,
  constraints?: Constraint[]
): VariableType => ({
  kind: "variable",
  name,
  constraints,
});

export const unionType = (types: Type[]): UnionType => ({
  kind: "union",
  types,
});

export const variantType = (name: string, args: Type[]): VariantType => ({
  kind: "variant",
  name,
  args,
});

export const adtType = (
  name: string,
  typeParams: string[],
  constructors: ConstructorDefinition[]
): ADTType => ({
  kind: "adt",
  name,
  typeParams,
  constructors,
});

export const unitType = (): UnitType => ({ kind: "unit" });

// Helper functions to create ADT variant types
export const optionType = (element: Type): VariantType => ({
  kind: "variant",
  name: "Option",
  args: [element],
});

export const resultType = (success: Type, error: Type): VariantType => ({
  kind: "variant",
  name: "Result",
  args: [success, error],
});

// Convenience functions for common types
export const optionInt = (): VariantType => optionType(intType());
export const resultString = (error: Type): VariantType =>
  resultType(stringType(), error);

export type HasFieldConstraint = {
	kind: "hasField";
	typeVar: string;
	field: string;
	fieldType: Type;
};

export type IsConstraint = {
	kind: "is";
	typeVar: string;
	constraint: string;
};

// Constraint helper functions
export const isConstraint = (
	typeVar: string,
	constraint: string,
): IsConstraint => ({
	kind: "is",
	typeVar,
	constraint,
});

export const hasFieldConstraint = (
	typeVar: string,
	field: string,
	fieldType: Type,
): HasFieldConstraint => ({
	kind: "hasField",
	typeVar,
	field,
	fieldType,
});

export type ImplementsConstraint = {
	kind: "implements";
	typeVar: string;
	interfaceName: string;
};

export const implementsConstraint = (
	typeVar: string,
	interfaceName: string,
): ImplementsConstraint => ({
	kind: "implements",
	typeVar,
	interfaceName,
});

export type CustomConstraint = {
	kind: "custom";
	typeVar: string;
	constraint: string;
	args: Type[];
};

export const customConstraint = (
	typeVar: string,
	constraint: string,
	args: Type[],
): CustomConstraint => ({
	kind: "custom",
	typeVar,
	constraint,
	args,
});

// Constrained type variable
export const constrainedTypeVariable = (
  name: string,
  constraints: Constraint[]
): VariableType => ({
  kind: "variable",
  name,
  constraints,
});

// Constrained function type
export const constrainedFunctionType = (
  params: Type[],
  returnType: Type,
  effects: Set<Effect> = new Set(),
  constraints: Constraint[] = []
): FunctionType => ({
  kind: "function",
  params,
  return: returnType,
  effects,
  constraints,
});
