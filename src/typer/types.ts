import type { Constraint, Type } from "../ast";

// ADT registry for tracking defined algebraic data types
export type ADTRegistry = Map<
	string,
	{
		typeParams: string[];
		constructors: Map<string, Type[]>; // constructor name -> arg types
	}
>;

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
	constraints: Constraint[]; // Track constraints during inference
	adtRegistry: ADTRegistry; // Track ADT definitions
	accessorCache: Map<string, Type>; // Cache accessor types by field name
};

// Type inference result
export type TypeResult = {
	type: Type;
	state: TypeState;
};
