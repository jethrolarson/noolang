import { type Type, type Constraint } from "../ast";
import { mapObject } from "./helpers";

// Performance tracking for substitute
let substituteCallCount = 0;
let totalSubstituteTime = 0;

// Cache for substitution results to avoid repeated work
const substituteCache = new Map<string, Type>();

// Apply substitution to a type
export const substitute = (
	type: Type,
	substitution: Map<string, Type>,
): Type => {
	const startTime = Date.now();
	substituteCallCount++;
	
	let result: Type;
	// Generate cache key - only for type variables as they're most common
	if (type.kind === 'variable' && substitution.size < 20) {
		const cacheKey = `${type.name}:${Array.from(substitution.entries()).map(([k,v]) => `${k}=${v.kind}`).join(',')}`;
		const cached = substituteCache.get(cacheKey);
		if (cached) {
			result = cached;
		} else {
			result = substituteWithCache(type, substitution, new Set());
			if (substituteCache.size < 1000) { // Prevent unbounded cache growth
				substituteCache.set(cacheKey, result);
			}
		}
	} else {
		result = substituteWithCache(type, substitution, new Set());
	}
	
	const elapsed = Date.now() - startTime;
	totalSubstituteTime += elapsed;
	
	// Stats tracking (disabled for clean output)
	
	return result;
};

const substituteWithCache = (
	type: Type,
	substitution: Map<string, Type>,
	seen: Set<string>,
): Type => {
	switch (type.kind) {
		case "variable": {
			if (seen.has(type.name)) {
				// Cycle detected, return original variable
				return type;
			}
			const sub = substitution.get(type.name);
			if (sub) {
				seen.add(type.name);
				const result = substituteWithCache(sub, substitution, seen);
				seen.delete(type.name);
				return result;
			}
			return type;
		}
		case "function":
			return {
				...type,
				params: type.params.map((param) =>
					substituteWithCache(param, substitution, seen),
				),
				return: substituteWithCache(type.return, substitution, seen),
				constraints: type.constraints?.map((c) =>
					substituteConstraint(c, substitution),
				),
			};
		case "list":
			return {
				...type,
				element: substituteWithCache(type.element, substitution, seen),
			};
		case "tuple":
			return {
				...type,
				elements: type.elements.map((el) =>
					substituteWithCache(el, substitution, seen),
				),
			};
		case "record":
			return {
				...type,
				fields: mapObject(type.fields, (v, k) =>
					substituteWithCache(v, substitution, seen),
				),
			};
		case "union":
			return {
				...type,
				types: type.types.map((t) =>
					substituteWithCache(t, substitution, seen),
				),
			};
		case "variant":
			return {
				...type,
				args: type.args.map((arg) =>
					substituteWithCache(arg, substitution, seen),
				),
			};
		default:
			return type;
	}
};

// Apply substitution to a constraint
export const substituteConstraint = (
	constraint: Constraint,
	substitution: Map<string, Type>,
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