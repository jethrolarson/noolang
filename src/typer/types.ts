import type { Constraint, Type, Effect } from '../ast';
import type { TraitRegistry } from './trait-system';

// ADT registry for tracking defined algebraic data types
export type ADTRegistry = Map<
	string,
	{
		typeParams: string[];
		constructors: Map<string, Type[]>; // constructor name -> arg types
	}
>;

// Constraint system types for trait support
export type ConstraintSignature = {
	name: string;
	typeParams: string[];
	functions: Map<string, Type>; // function name -> type signature
};

export type ConstraintImplementation = {
	functions: Map<string, TypeScheme>; // function name -> implementation
};

export type ConstraintRegistry = Map<
	string,
	{
		signature: ConstraintSignature;
		implementations: Map<string, ConstraintImplementation>; // type name -> implementation
	}
>;

// Type scheme for let-polymorphism
export type TypeScheme = {
	type: Type;
	quantifiedVars: string[];
	effects?: Set<Effect>; // Effects for values that have effects
};

export type TypeEnvironment = Map<string, TypeScheme> & {
	constraints?: ConstraintRegistry;
};

// Functional state for type inference
export type TypeState = {
	environment: TypeEnvironment;
	substitution: Map<string, Type>;
	counter: number;
	constraints: Constraint[]; // Track constraints during inference
	adtRegistry: ADTRegistry; // Track ADT definitions
	accessorCache: Map<string, Type>; // Cache accessor types by field name
	constraintRegistry: ConstraintRegistry; // Track constraint definitions and implementations (LEGACY)
	traitRegistry: TraitRegistry; // NEW: Simple trait system
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

export const createTypeResult = (
	type: Type,
	effects: Set<Effect>,
	state: TypeState
): TypeResult => ({
	type,
	effects,
	state,
});

export const createPureTypeResult = (
	type: Type,
	state: TypeState
): TypeResult => ({
	type,
	effects: emptyEffects(),
	state,
});

// Constraint registry helpers
export const createConstraintRegistry = (): ConstraintRegistry => new Map();

export const addConstraintDefinition = (
	registry: ConstraintRegistry,
	name: string,
	signature: ConstraintSignature
): void => {
	registry.set(name, {
		signature,
		implementations: new Map(),
	});
};

export const addConstraintImplementation = (
	registry: ConstraintRegistry,
	constraintName: string,
	typeName: string,
	implementation: ConstraintImplementation
): boolean => {
	const constraint = registry.get(constraintName);
	if (!constraint) {
		return false; // Constraint not defined
	}
	constraint.implementations.set(typeName, implementation);
	return true;
};

export const resolveConstraintFunction = (
	registry: ConstraintRegistry,
	constraintName: string,
	functionName: string,
	concreteType: Type
): TypeScheme | null => {
	const constraint = registry.get(constraintName);
	if (!constraint) {
		return null;
	}

	// Convert type to string for lookup
	const typeName = typeToString(concreteType);
	const impl = constraint.implementations.get(typeName);
	return impl?.functions.get(functionName) || null;
};

// Helper to get constraint signature
export const getConstraintSignature = (
	registry: ConstraintRegistry,
	constraintName: string
): ConstraintSignature | null => {
	return registry.get(constraintName)?.signature || null;
};

// Helper function to convert Type to string for registry keys
const typeToString = (type: Type): string => {
	switch (type.kind) {
		case 'primitive':
			return type.name;
		case 'variable':
			return type.name;
		case 'list':
			return `List ${typeToString(type.element)}`;
		case 'tuple':
			return `{${type.elements.map(typeToString).join(', ')}}`;
		case 'record': {
			const fields = Object.entries(type.fields)
				.map(([k, v]) => `${k}: ${typeToString(v)}`)
				.join(', ');
			return `{${fields}}`;
		}
		case 'function': {
			const params = type.params.map(typeToString).join(' -> ');
			return `${params} -> ${typeToString(type.return)}`;
		}
		case 'union':
			return type.types.map(typeToString).join(' | ');
		case 'variant':
			return type.args.length > 0
				? `${type.name} ${type.args.map(typeToString).join(' ')}`
				: type.name;
		case 'adt':
			return type.name;
		case 'unit':
			return 'Unit';
		case 'unknown':
			return '?';
		default:
			return 'Unknown';
	}
};
