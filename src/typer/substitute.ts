import { type Type, type Constraint, type StructureFieldType } from '../ast';
import { mapObject } from './helpers';
import { reduceConstructorValue } from './kinded-constructors';

// Apply substitution to a type
export const substitute = (
	type: Type,
	substitution: Map<string, Type>
): Type => {
	// Add null check to prevent crashes
	if (!type) {
		throw new Error('Cannot substitute undefined type');
	}
	
	// No cache - just do the substitution directly
	return substituteImpl(substitution, new Set())(type);
};

const substituteImpl =
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
					const result = substituteImpl(substitution, seen)(sub);
					seen.delete(type.name);
					return result;
				}
				return type;
			}
			case 'constructor':
				return {
					...type,
					bindings: new Map(
						Array.from(type.bindings, ([name, value]) => [
							name,
							substituteImpl(substitution, seen)(value),
						])
					),
				};
			case 'function':
				return {
					...type,
					params: type.params.map(substituteImpl(substitution, seen)),
					return: substituteImpl(substitution, seen)(type.return),
					constraints: type.constraints?.map(c =>
						substituteConstraint(c, substitution)
					),
				};
			case 'list':
				return {
					...type,
					element: substituteImpl(substitution, seen)(type.element),
				};
			case 'tuple':
				return {
					...type,
					elements: type.elements.map(substituteImpl(substitution, seen)),
				};
			case 'record':
				return {
					...type,
					fields: mapObject(
						type.fields,
						substituteImpl(substitution, seen)
					),
				};
			case 'union':
				return {
					...type,
					types: type.types.map(substituteImpl(substitution, seen)),
				};
			case 'variant': {
				// Check if the variant name itself should be substituted
				const substitutedName = substitution.get(type.name);
				if (substitutedName) {
					if (substitutedName.kind === 'constructor') {
						return reduceConstructorValue(
							substitutedName,
							type.args.map(substituteImpl(substitution, seen))
						);
					}
					// The variant name is being substituted
					if (substitutedName.kind === 'variant' && substitutedName.name === 'List') {
						// Special case: substituting with List constructor -> create list type
						if (type.args.length === 1) {
							return {
								kind: 'list',
								element: substituteImpl(substitution, seen)(type.args[0])
							};
						}
					} else if (substitutedName.kind === 'variant') {
						// Substituting with another variant constructor. `type.args` are
						// this occurrence's own generic args (e.g. the `a` in `m a`);
						// `substitutedName.args` are "extra" args the concrete constructor
						// carries beyond what the trait models (e.g. Result's error type,
						// which the unary `Monad m` signature never mentions) — see
						// tryUnifyConstrainedVariant in unify.ts, which stores exactly
						// those extras rather than the full concrete arg list. Appending
						// them preserves arity instead of silently truncating to
						// `type.args.length`.
						return {
							...type,
							name: substitutedName.name,
							args: [
								...type.args.map(substituteImpl(substitution, seen)),
								...substitutedName.args.map(substituteImpl(substitution, seen)),
							],
						};
					}
					// For other substitution types, fall through to normal arg substitution
				}
				
				// Normal case: just substitute the arguments
				return {
					...type,
					args: type.args.map(substituteImpl(substitution, seen)),
				};
			}
			case 'constrained':
				return {
					...type,
					baseType: substituteImpl(substitution, seen)(type.baseType),
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
