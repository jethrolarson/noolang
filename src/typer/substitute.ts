import { type Type, type Constraint, type StructureFieldType } from '../ast';
import { mapObject } from './helpers';


// Cache for substitution results to avoid repeated work
const substituteCache = new Map<string, Type>();

// Apply substitution to a type
export const substitute = (
	type: Type,
	substitution: Map<string, Type>
): Type => {
	let result: Type;
	// Generate cache key - only for type variables as they're most common
	if (type.kind === 'variable' && substitution.size < 20) {
		const cacheKey = `${type.name}:${Array.from(substitution.entries())
			.map(([k, v]) => `${k}=${v.kind}`)
			.join(',')}`;
		const cached = substituteCache.get(cacheKey);
		if (cached) {
			result = cached;
		} else {
			result = substituteWithCache(substitution, new Set())(type);
			if (substituteCache.size < 1000) {
				// Prevent unbounded cache growth
				substituteCache.set(cacheKey, result);
			}
		}
	} else {
		result = substituteWithCache(substitution, new Set())(type);
	}

	return result;
};

const substituteWithCache =
	(substitution: Map<string, Type>, seen: Set<string>) =>
	(type: Type): Type => {
		switch (type.kind) {
			case 'variable': {
				if (seen.has(type.name)) {
					// Cycle detected, return original variable
					return type;
				}
				const sub = substitution.get(type.name);
				if (sub) {
					seen.add(type.name);
					const result = substituteWithCache(substitution, seen)(sub);
					seen.delete(type.name);
					return result;
				}
				return type;
			}
			case 'function':
				return {
					...type,
					params: type.params.map(substituteWithCache(substitution, seen)),
					return: substituteWithCache(substitution, seen)(type.return),
					constraints: type.constraints?.map(c =>
						substituteConstraint(c, substitution)
					),
				};
			case 'list':
				return {
					...type,
					element: substituteWithCache(substitution, seen)(type.element),
				};
			case 'tuple':
				return {
					...type,
					elements: type.elements.map(substituteWithCache(substitution, seen)),
				};
			case 'record':
				return {
					...type,
					fields: mapObject(
						type.fields,
						substituteWithCache(substitution, seen)
					),
				};
			case 'union':
				return {
					...type,
					types: type.types.map(substituteWithCache(substitution, seen)),
				};
			case 'variant': {
				// Check if the variant name itself should be substituted
				const substitutedName = substitution.get(type.name);
				if (substitutedName) {
					// The variant name is being substituted
					if (substitutedName.kind === 'primitive' && substitutedName.name === 'List') {
						// Special case: substituting with List constructor -> create list type
						if (type.args.length === 1) {
							return {
								kind: 'list',
								element: substituteWithCache(substitution, seen)(type.args[0])
							};
						}
					} else if (substitutedName.kind === 'variant') {
						// Substituting with another variant constructor
						return {
							...type,
							name: substitutedName.name,
							args: type.args.map(substituteWithCache(substitution, seen)),
						};
					}
					// For other substitution types, fall through to normal arg substitution
				}
				
				// Normal case: just substitute the arguments
				return {
					...type,
					args: type.args.map(substituteWithCache(substitution, seen)),
				};
			}
			case 'constrained':
				return {
					...type,
					baseType: substituteWithCache(substitution, seen)(type.baseType),
					// Keep constraints as-is for now - they reference type variables by name
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
		case 'is':
			return constraint; // No substitution needed for is constraints
		case 'hasField':
			return {
				...constraint,
				fieldType: substitute(constraint.fieldType, substitution),
			};
		case 'implements':
			return constraint; // No substitution needed for implements constraints
		case 'custom':
			return {
				...constraint,
				args: constraint.args.map(arg => substitute(arg, substitution)),
			};
		case 'has':
			return {
				...constraint,
				structure: {
					fields: Object.fromEntries(
						Object.entries(constraint.structure.fields).map(([fieldName, fieldType]) => [
							fieldName,
							substitute(fieldType as Type, substitution) as StructureFieldType,
						])
					),
				},
			};
		default:
			return constraint;
	}
};
