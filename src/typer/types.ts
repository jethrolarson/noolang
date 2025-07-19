import type { Constraint, Type, Effect } from "../ast";

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

// Type inference result with separated effects
export type TypeResult = {
	type: Type;
	effects: Set<Effect>;
	state: TypeState;
};

// Effect manipulation helpers
export const emptyEffects = (): Set<Effect> => new Set();

export const singleEffect = (effect: Effect): Set<Effect> => new Set([effect]);

export const unionEffects = (...effectSets: Set<Effect>[]): Set<Effect> => {
	const result = new Set<Effect>();
	for (const effects of effectSets) {
		for (const effect of effects) {
			result.add(effect);
		}
	}
	return result;
};

export const createTypeResult = (type: Type, effects: Set<Effect>, state: TypeState): TypeResult => ({
	type,
	effects,
	state,
});

export const createPureTypeResult = (type: Type, state: TypeState): TypeResult => ({
	type,
	effects: emptyEffects(),
	state,
});
