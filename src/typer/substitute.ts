import { type Type, type Constraint, type StructureFieldType } from '../ast';
import { mapObject } from './helpers';


// Cache for substitution results to avoid repeated work
const substituteCache = new Map<string, Type>();

// Apply substitution to a type
export const substitute = (
	type: Type,
	substitution: Map<string, Type>
): Type => {
	// Add null check to prevent crashes
	if (!type) {
		throw new Error('Cannot substitute undefined type');
	}
	
	// Fast path: if substitution is empty, return original type
	if (substitution.size === 0) return type;
	
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
			// Reuse a single seen set through the call chain
			const seen = new Set<string>();
			result = substituteWithCache(substitution, seen)(type);
			if (substituteCache.size < 1000) {
				// Prevent unbounded cache growth
				substituteCache.set(cacheKey, result);
			}
		}
	} else {
		const seen = new Set<string>();
		result = substituteWithCache(substitution, seen)(type);
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
			case 'function': {
				let paramsChanged = false;
				const newParams = type.params.map(p => {
					const np = substituteWithCache(substitution, seen)(p);
					if (np !== p) paramsChanged = true;
					return np;
				});
				const newReturn = substituteWithCache(substitution, seen)(type.return);
				const constraints = type.constraints?.map(c => substituteConstraint(c, substitution));
				if (!paramsChanged && newReturn === type.return && (!constraints || constraints === type.constraints)) {
					return type;
				}
				return { ...type, params: newParams, return: newReturn, constraints };
			}
			case 'list': {
				const newElem = substituteWithCache(substitution, seen)(type.element);
				return newElem === type.element ? type : { ...type, element: newElem };
			}
			case 'tuple': {
				let changed = false;
				const elems = type.elements.map(e => {
					const ne = substituteWithCache(substitution, seen)(e);
					if (ne !== e) changed = true;
					return ne;
				});
				return changed ? { ...type, elements: elems } : type;
			}
			case 'record': {
				let changed = false;
				const newFields: { [k: string]: Type } = {};
				for (const k in type.fields) {
					const v = type.fields[k];
					const nv = substituteWithCache(substitution, seen)(v);
					newFields[k] = nv;
					if (nv !== v) changed = true;
				}
				return changed ? { ...type, fields: newFields } : type;
			}
			case 'union': {
				let changed = false;
				const types = type.types.map(t => {
					const nt = substituteWithCache(substitution, seen)(t);
					if (nt !== t) changed = true;
					return nt;
				});
				return changed ? { ...type, types } : type;
			}
			case 'variant': {
				// Check if the variant name itself should be substituted
				const substitutedName = substitution.get(type.name);
				if (substitutedName) {
					if (substitutedName.kind === 'variant' && substitutedName.name === 'List') {
						if (type.args.length === 1) {
							return {
								kind: 'list',
								element: substituteWithCache(substitution, seen)(type.args[0])
							};
						}
					} else if (substitutedName.kind === 'variant') {
						const newArgs = type.args.map(a => substituteWithCache(substitution, seen)(a));
						return { ...type, name: substitutedName.name, args: newArgs };
					}
				}
				let changed = false;
				const args = type.args.map(a => {
					const na = substituteWithCache(substitution, seen)(a);
					if (na !== a) changed = true;
					return na;
				});
				return changed ? { ...type, args } : type;
			}
			case 'constrained': {
				const base = substituteWithCache(substitution, seen)(type.baseType);
				return base === type.baseType ? type : { ...type, baseType: base };
			}
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
