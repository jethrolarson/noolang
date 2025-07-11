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
export type Type = 
  | { kind: 'primitive'; name: 'Int' | 'String' | 'Bool' | 'List' }
  | { kind: 'function'; params: Type[]; return: Type }
  | { kind: 'variable'; name: string }
  | { kind: 'unknown' };

// Expressions
export type Expression = 
  | LiteralExpression
  | VariableExpression
  | FunctionExpression
  | ApplicationExpression
  | PipelineExpression
  | BinaryExpression
  | IfExpression;

export interface LiteralExpression {
  kind: 'literal';
  value: number | string | boolean | any[];
  type?: Type;
  location: Location;
}

export interface VariableExpression {
  kind: 'variable';
  name: string;
  type?: Type;
  location: Location;
}

export interface FunctionExpression {
  kind: 'function';
  params: string[];
  body: Expression;
  type?: Type;
  location: Location;
}

export interface ApplicationExpression {
  kind: 'application';
  func: Expression;
  args: Expression[];
  type?: Type;
  location: Location;
}

export interface PipelineExpression {
  kind: 'pipeline';
  steps: Expression[];
  type?: Type;
  location: Location;
}

export interface BinaryExpression {
  kind: 'binary';
  operator: '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '>' | '<=' | '>=';
  left: Expression;
  right: Expression;
  type?: Type;
  location: Location;
}

export interface IfExpression {
  kind: 'if';
  condition: Expression;
  then: Expression;
  else: Expression;
  type?: Type;
  location: Location;
}



// Top-level constructs
export type TopLevel = Definition | Expression;

export interface Definition {
  kind: 'definition';
  name: string;
  value: Expression;
  type?: Type;
  location: Location;
}

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
export const intType = (): Type => ({ kind: 'primitive', name: 'Int' });
export const stringType = (): Type => ({ kind: 'primitive', name: 'String' });
export const boolType = (): Type => ({ kind: 'primitive', name: 'Bool' });
export const listType = (): Type => ({ kind: 'primitive', name: 'List' });
export const functionType = (params: Type[], returnType: Type): Type => ({
  kind: 'function',
  params,
  return: returnType,
});
export const typeVariable = (name: string): Type => ({ kind: 'variable', name });
export const unknownType = (): Type => ({ kind: 'unknown' }); 