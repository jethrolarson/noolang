import {
	type Type,
	functionType,
	typeVariable,
	type VariableType,
	type PrimitiveType,
	type FunctionType,
	type ListType,
	type TupleType,
	type RecordType,
	type ConstrainedType,
	type UnionType,
	type VariantType,
	type Constraint,
	type IsConstraint,
	type HasFieldConstraint,
	type ImplementsConstraint,
	type CustomConstraint,
	type HasStructureConstraint,
	type RecordStructure,
} from '../ast';
import { formatTypeError } from './type-errors';
import { NoolangError } from '../errors';
import { substitute } from './substitute';
import { formatEffectsString } from './effects-utils';

type CodeLocation = {
	line: number;
	column: number;
};

// Helper: Extract location from expression or provide default
export const getExprLocation = (expr: {
	location?: { start: CodeLocation };
}): CodeLocation => ({
	line: expr.location?.start.line || 1,
	column: expr.location?.start.column || 1,
});

// Helper: Throw formatted type error with consistent pattern
export function throwTypeError(
	errorFactory: (location: CodeLocation) => NoolangError,
	location?: CodeLocation
): never {
	const loc = location || { line: 1, column: 1 };
	throw new Error(formatTypeError(errorFactory(loc)));
}

// Helper: Create common function types
export const createUnaryFunctionType = (
	paramType: Type,
	returnType: Type
): Type => functionType([paramType], returnType);

export const createBinaryFunctionType = (
	param1Type: Type,
	param2Type: Type,
	returnType: Type
): Type => functionType([param1Type, param2Type], returnType);

// Helper: Create polymorphic function types with type variables
export const createPolymorphicUnaryFunction = (
	paramVar: string,
	returnVar: string
): Type => functionType([typeVariable(paramVar)], typeVariable(returnVar));

export const createPolymorphicBinaryFunction = (
	param1Var: string,
	param2Var: string,
	returnVar: string
): Type =>
	functionType(
		[typeVariable(param1Var), typeVariable(param2Var)],
		typeVariable(returnVar)
	);

// Utility: mapObject for mapping over record fields
export function mapObject<T, U>(
	obj: { [k: string]: T },
	fn: (v: T, k: string) => U
): { [k: string]: U } {
	const result: { [k: string]: U } = {};
	for (const k in obj) result[k] = fn(obj[k], k);
	return result;
}

// Utility: mapSet for immutable Map updates - optimized to avoid copying large maps
export function mapSet<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
	// For performance, avoid copying large maps unnecessarily
	if (map.has(key) && map.get(key) === value) {
		return map; // No change needed
	}
	const copy = new Map(map);
	copy.set(key, value);
	return copy;
}

// Utility: isTypeKind type guard
export function isTypeKind<T extends Type['kind']>(
	t: Type,
	kind: T
): t is Extract<Type, { kind: T }> {
	return t.kind === kind;
}

// Cache for typesEqual to avoid repeated deep comparisons
const typesEqualCache = new Map<string, boolean>();

// Check if two types are structurally equal
export const typesEqual = (t1: Type, t2: Type): boolean => {
	// Quick reference equality check
	if (t1 === t2) return true;

	if (t1.kind !== t2.kind) {
		return false;
	}

	// Simple cache for primitive/variable types (both have 'name' property)
	if (
		(t1.kind === 'primitive' || t1.kind === 'variable') &&
		(t2.kind === 'primitive' || t2.kind === 'variable')
	) {
		// TypeScript knows these are PrimitiveType | VariableType, both have 'name'
		const key = `${t1.kind}:${t1.name}-${t2.kind}:${t2.name}`;
		const cached = typesEqualCache.get(key);
		if (cached !== undefined) return cached;

		const result = typesEqualUncached(t1, t2);
		if (typesEqualCache.size < 500) {
			typesEqualCache.set(key, result);
		}
		return result;
	}

	return typesEqualUncached(t1, t2);
};

const typesEqualUncached = (t1: Type, t2: Type): boolean => {
	switch (t1.kind) {
		case 'variable':
			return t1.name === (t2 as VariableType).name;

		case 'primitive':
			return t1.name === (t2 as PrimitiveType).name;

		case 'function': {
			const f2 = t2 as FunctionType;
			if (t1.params.length !== f2.params.length) {
				return false;
			}
			return (
				t1.params.every((param, i) => typesEqual(param, f2.params[i])) &&
				typesEqual(t1.return, f2.return)
			);
		}

		case 'list':
			return typesEqual(t1.element, (t2 as ListType).element);

		case 'tuple': {
			const t2_tuple = t2 as TupleType;
			if (t1.elements.length !== t2_tuple.elements.length) {
				return false;
			}
			return t1.elements.every((element, i) =>
				typesEqual(element, t2_tuple.elements[i])
			);
		}

		case 'record': {
			const t2_record = t2 as RecordType;
			const keys1 = Object.keys(t1.fields);
			const keys2 = Object.keys(t2_record.fields);
			if (keys1.length !== keys2.length) {
				return false;
			}
			return keys1.every(key =>
				typesEqual(t1.fields[key], t2_record.fields[key])
			);
		}

		case 'union': {
			const t2_union = t2 as UnionType;
			if (t1.types.length !== t2_union.types.length) {
				return false;
			}
			return t1.types.every((type, i) => typesEqual(type, t2_union.types[i]));
		}

		case 'unit':
			return true;

		case 'constrained': {
			const t2_constrained = t2 as ConstrainedType;
			if (!typesEqual(t1.baseType, t2_constrained.baseType)) {
				return false;
			}
			// For now, just check constraint equality by comparison
			// TODO: More sophisticated constraint equivalence checking
			if (t1.constraints.size !== t2_constrained.constraints.size) {
				return false;
			}
			for (const [varName, constraints1] of t1.constraints) {
				const constraints2 = t2_constrained.constraints.get(varName);
				if (!constraints2 || constraints1.length !== constraints2.length) {
					return false;
				}
				// Simple constraint comparison - could be improved
				for (let i = 0; i < constraints1.length; i++) {
					const c1 = constraints1[i];
					const c2 = constraints2[i];
					if (c1.kind !== c2.kind) return false;
					if (c1.kind === 'implements' && c2.kind === 'implements') {
						if (c1.interfaceName !== c2.interfaceName) return false;
					} else if (c1.kind === 'hasField' && c2.kind === 'hasField') {
						if (
							c1.field !== c2.field ||
							!typesEqual(c1.fieldType, c2.fieldType)
						) {
							return false;
						}
					}
				}
			}
			return true;
		}

		case 'variant': {
			const t2_variant = t2 as VariantType;
			if (t1.name !== t2_variant.name) {
				return false;
			}
			if (t1.args.length !== t2_variant.args.length) {
				return false;
			}
			return t1.args.every((arg, i) => typesEqual(arg, t2_variant.args[i]));
		}

		default:
			return false;
	}
};

// Efficient type similarity check to avoid JSON.stringify (simplified for constraint comparison)
export const typesSimilar = (t1: Type, t2: Type): boolean => {
	if (t1.kind !== t2.kind) return false;

	switch (t1.kind) {
		case 'primitive':
			return t1.name === (t2 as PrimitiveType).name;
		case 'variable':
			return t1.name === (t2 as VariableType).name;
		case 'function': {
			const t2Func = t2 as FunctionType;
			return (
				t1.params.length === t2Func.params.length &&
				t1.params.every((p, i) => typesSimilar(p, t2Func.params[i])) &&
				typesSimilar(t1.return, t2Func.return)
			);
		}
		case 'list':
			return typesSimilar(t1.element, (t2 as ListType).element);
		case 'record': {
			const t2Record = t2 as RecordType;
			const fields1 = Object.keys(t1.fields);
			const fields2 = Object.keys(t2Record.fields);
			return (
				fields1.length === fields2.length &&
				fields1.every(
					f =>
						f in t2Record.fields &&
						typesSimilar(t1.fields[f], t2Record.fields[f])
				)
			);
		}
		case 'tuple': {
			const t2Tuple = t2 as TupleType;
			return (
				t1.elements.length === t2Tuple.elements.length &&
				t1.elements.every((e, i) => typesSimilar(e, t2Tuple.elements[i]))
			);
		}
		case 'union': {
			const t2Union = t2 as UnionType;
			return (
				t1.types.length === t2Union.types.length &&
				t1.types.every((type, i) => typesSimilar(type, t2Union.types[i]))
			);
		}
		default:
			return false;
	}
};

// Efficient constraint comparison to replace expensive JSON.stringify
export const constraintsEqual = (c1: Constraint, c2: Constraint): boolean => {
	if (c1.kind !== c2.kind || c1.typeVar !== c2.typeVar) return false;

	switch (c1.kind) {
		case 'is':
			return c1.constraint === (c2 as IsConstraint).constraint;
		case 'hasField': {
			const c2HasField = c2 as HasFieldConstraint;
			return (
				c1.field === c2HasField.field &&
				typesSimilar(c1.fieldType, c2HasField.fieldType)
			);
		}
		case 'implements':
			return c1.interfaceName === (c2 as ImplementsConstraint).interfaceName;
		case 'custom':
			return c1.constraint === (c2 as CustomConstraint).constraint;
		case 'has': {
			const c2Has = c2 as HasStructureConstraint;
			const fields1 = Object.keys(c1.structure.fields);
			const fields2 = Object.keys(c2Has.structure.fields);
			if (fields1.length !== fields2.length) return false;
			for (const fieldName of fields1) {
				if (!fields2.includes(fieldName)) return false;
				const fieldType1 = c1.structure.fields[fieldName] as Type;
				const fieldType2 = c2Has.structure.fields[fieldName] as Type;
				if (!typesSimilar(fieldType1, fieldType2)) return false;
			}
			return true;
		}
		default:
			return false;
	}
};

// Helper function to propagate a constraint to matching type variables in a function type
export const propagateConstraintToTypeVariable = (
	funcType: Type,
	constraint: Constraint
): void => {
	if (funcType.kind !== 'function') return;

	// Apply constraint to matching type variables in parameters
	for (const param of funcType.params) {
		if (param.kind === 'variable' && param.name === constraint.typeVar) {
			if (!param.constraints) {
				param.constraints = [];
			}
			// Check if this constraint is already present
			const existingConstraint = param.constraints.find(c =>
				constraintsEqual(c, constraint)
			);
			if (!existingConstraint) {
				param.constraints.push(constraint);
			}
		}
	}

	// Also apply to return type if it matches
	if (
		funcType.return.kind === 'variable' &&
		funcType.return.name === constraint.typeVar
	) {
		if (!funcType.return.constraints) {
			funcType.return.constraints = [];
		}
		const existingConstraint = funcType.return.constraints.find(c =>
			constraintsEqual(c, constraint)
		);
		if (!existingConstraint) {
			funcType.return.constraints.push(constraint);
		}
	}
};

// TODO Break this up into smaller functions
// Utility function to convert type to string
export const typeToString = (
	type: Type,
	substitution: Map<string, Type> = new Map(),
	showConstraints: boolean = true,
	normalizeVariables: boolean = true
): string => {
	const latin = [
		'a',
		'b',
		'c',
		'd',
		'e',
		'f',
		'g',
		'h',
		'i',
		'j',
		'k',
		'l',
		'm',
		'n',
		'o',
		'p',
		'q',
		'r',
		's',
		't',
		'u',
		'v',
		'w',
		'x',
		'y',
		'z',
	];
	const mapping = new Map<string, string>();
	let next = 0;

	// NEW: Collect constraints prioritizing function-level multiplicative constraints
	const allConstraints: Constraint[] = [];

	function collectConstraints(t: Type): void {
		switch (t.kind) {
			case 'variable':
				if (t.constraints) {
					allConstraints.push(...t.constraints);
				}
				break;
			case 'function':
				// For function types, prioritize function-level constraints over parameter constraints
				if (t.constraints && t.constraints.length > 0) {
					// Use function-level multiplicative constraints
					allConstraints.push(...t.constraints);
				} else {
					// Fall back to parameter constraints if no function-level constraints
					t.params.forEach(collectConstraints);
				}
				// Only collect from return type if it's not a function to avoid duplicate constraints in curried functions
				if (t.return.kind !== 'function') {
					collectConstraints(t.return);
				}
				break;
			case 'list':
				collectConstraints(t.element);
				break;
			case 'tuple':
				t.elements.forEach(collectConstraints);
				break;
			case 'record':
				Object.values(t.fields).forEach(collectConstraints);
				break;
			case 'variant':
				t.args.forEach(collectConstraints);
				break;
			case 'union':
				t.types.forEach(collectConstraints);
				break;
			case 'constrained':
				collectConstraints(t.baseType);
				for (const constraints of t.constraints.values()) {
					allConstraints.push(...constraints);
				}
				break;
		}
	}

	// Helper to assign/display variable names
	function norm(t: Type): string {
		switch (t.kind) {
			case 'primitive':
				return t.name;
			case 'function': {
				const paramStr = t.params
					.map(param => {
						// Add parentheses around function type parameters
						if (param.kind === 'function') {
							return `(${norm(param)})`;
						}
						return norm(param);
					})
					.join(' ');
				const effectStr = formatEffectsString(t.effects);
				const baseType = `${paramStr} -> ${norm(t.return)}${effectStr}`;
				return baseType;
			}
			case 'variable': {
				if (!normalizeVariables) {
					return t.name; // Return raw variable name for debugging
				}
				if (!mapping.has(t.name)) {
					mapping.set(t.name, latin[next] || `t${next}`);
					next++;
				}
				return mapping.get(t.name)!;
			}
			case 'list':
				return `List ${norm(t.element)}`;
			case 'tuple':
				return `{${t.elements.map(norm).join(', ')}}`;
			case 'record': {
				const fields = Object.entries(t.fields)
					.map(([name, fieldType]) => `@${name} ${norm(fieldType)}`)
					.join(', ');
				return fields.length > 0 ? `{ ${fields} }` : `{ }`;
			}
			case 'union':
				return `(${t.types.map(norm).join(' | ')})`;
			case 'variant': {
				// If variant name looks like a type variable, normalize it
				let variantName = t.name;
				if (!normalizeVariables) {
					// Return raw variant name for debugging
					variantName = t.name;
				} else if (/^α\d+$/.test(t.name)) {
					variantName = mapping.has(t.name)
						? mapping.get(t.name)!
						: (() => {
								mapping.set(t.name, latin[next] || `t${next}`);
								next++;
								return mapping.get(t.name)!;
							})();
				}
				if (t.args.length === 0) {
					return variantName;
				} else {
					return `${variantName} ${t.args.map(norm).join(' ')}`;
				}
			}
			case 'unit':
				return '{}';
			case 'constrained': {
				// Show base type with constraints
				const constrainedType: ConstrainedType = t;

				const baseStr = norm(constrainedType.baseType);
				if (constrainedType.constraints.size === 0) {
					return baseStr;
				}
				const constraintStrs: string[] = [];
				for (const [varName, constraints] of constrainedType.constraints) {
					for (const constraint of constraints) {
						if (constraint.kind === 'implements') {
							constraintStrs.push(
								`${varName} implements ${constraint.interfaceName}`
							);
						} else if (constraint.kind === 'hasField') {
							constraintStrs.push(
								`${varName} has ${constraint.field}: ${norm(constraint.fieldType)}`
							);
						}
					}
				}
				return `${baseStr} given ${constraintStrs.join(', ')}`;
			}
			case 'unknown':
				return 'Unknown';
			default:
				return 'Unknown';
		}
	}

	// Helper function to format structure constraints
	function formatStructure(structure: RecordStructure): string {
		const fieldDescs = Object.entries(structure.fields)
			.map(([fieldName, fieldType]) => {
				// Handle nested field types directly
				if (fieldType.kind === 'nested') {
					// Format nested structure recursively
					const nestedFieldDescs = Object.entries(fieldType.structure.fields)
						.map(([nestedFieldName, nestedFieldType]) => {
							if (nestedFieldType.kind === 'nested') {
								// Handle deeply nested structures
								const deepNestedDesc = Object.entries(
									nestedFieldType.structure.fields
								)
									.map(
										([innerName, innerType]) =>
											`@${innerName} ${norm(innerType as Type)}`
									)
									.join(', ');
								return `@${nestedFieldName} {${deepNestedDesc}}`;
							} else {
								return `@${nestedFieldName} ${norm(nestedFieldType)}`;
							}
						})
						.join(', ');
					return `@${fieldName} {${nestedFieldDescs}}`;
				} else {
					const fieldTypeStr = norm(fieldType);
					// Check if the field type has nested constraints
					if (
						fieldType.kind === 'variable' &&
						fieldType.constraints &&
						fieldType.constraints.length > 0
					) {
						const nestedConstraints = fieldType.constraints
							.map(c => {
								if (c.kind === 'has') {
									const nestedFieldDescs = Object.entries(c.structure.fields)
										.map(([nestedFieldName, nestedFieldType]) => {
											if (nestedFieldType.kind === 'nested') {
												// Handle nested structure recursively
												const nestedDesc = Object.entries(
													nestedFieldType.structure.fields
												)
													.map(
														([innerName, innerType]) =>
															`@${innerName} ${norm(innerType as Type)}`
													)
													.join(', ');
												return `@${nestedFieldName} {${nestedDesc}}`;
											} else {
												// Handle regular field type
												return `@${nestedFieldName} ${norm(nestedFieldType)}`;
											}
										})
										.join(', ');
									return `${normalizeConstraintVariable(c.typeVar)} has {${nestedFieldDescs}}`;
								}
								return 'unknown constraint';
							})
							.join(' and ');
						return `@${fieldName} ${fieldTypeStr} given ${nestedConstraints}`;
					}
					return `@${fieldName} ${fieldTypeStr}`;
				}
			})
			.join(', ');
		return `{${fieldDescs}}`;
	}

	// Helper function to normalize constraint variable names using existing mapping
	function normalizeConstraintVariable(typeVar: string): string {
		if (!normalizeVariables) {
			return typeVar; // Return raw variable name for debugging
		}
		// Use the existing mapping established by norm() function
		// This ensures constraint variables match the parameter/return type variables
		if (!mapping.has(typeVar)) {
			// For single-letter variable names (like variant type names), preserve them
			if (typeVar.length === 1 && /^[a-z]$/.test(typeVar)) {
				mapping.set(typeVar, typeVar);
			} else {
				mapping.set(typeVar, latin[next] || `t${next}`);
				next++;
			}
		}
		return mapping.get(typeVar)!;
	}

	function formatConstraint(c: Constraint): string {
		// Apply substitution to get the final variable name, then normalize for display
		const constraintVarType = substitute(
			{ kind: 'variable', name: c.typeVar },
			substitution
		);
		const finalVarName =
			constraintVarType.kind === 'variable'
				? constraintVarType.name
				: c.typeVar;
		const normalizedVar = normalizeConstraintVariable(finalVarName);

		switch (c.kind) {
			case 'implements': {
				return `${normalizedVar} implements ${c.interfaceName}`;
			}
			case 'hasField': {
				return `${normalizedVar} has ${c.field}: ${norm(c.fieldType)}`;
			}
			case 'has': {
				const structureStr = formatStructure(c.structure);
				return `${normalizedVar} has ${structureStr}`;
			}
			case 'is': {
				return `${normalizedVar} is ${c.constraint}`;
			}
			case 'custom': {
				const argsStr = c.args.map(norm).join(', ');
				return `${normalizedVar} ${c.constraint}(${argsStr})`;
			}
			default:
				return 'unknown constraint';
		}
	}

	// Apply substitution to the type before normalizing
	const substitutedType = substitute(type, substitution);

	// If function type, traverse all params and return first to ensure variable mapping order
	if (substitutedType.kind === 'function') {
		substitutedType.params.forEach(param => norm(param));
		norm(substitutedType.return);
	}

	// Now collect constraints with the correct variable mapping
	const baseTypeStr = norm(substitutedType);

	if (showConstraints) {
		collectConstraints(substitutedType);
	}

	// If we have constraints, we need to rebuild the string with constraints
	if (
		showConstraints &&
		allConstraints.length > 0 &&
		substitutedType.kind === 'function'
	) {
		const paramStr = substitutedType.params
			.map(param => {
				// Add parentheses around function type parameters
				if (param.kind === 'function') {
					return `(${norm(param)})`;
				}
				return norm(param);
			})
			.join(' ');
		const effectStr = formatEffectsString(substitutedType.effects);
		const baseType = `${paramStr} -> ${norm(substitutedType.return)}${effectStr}`;

		const constraintStr = ` given ${deduplicateConstraints(
			allConstraints,
			substitution
		)
			.sort((a, b) => {
				const order: Record<string, number> = {
					implements: 0,
					has: 1,
					hasField: 2,
					is: 3,
					custom: 4,
				};
				return (order[a.kind] || 5) - (order[b.kind] || 5);
			})
			.map(formatConstraint)
			.join(' and ')}`;

		return `${baseType}${constraintStr}`;
	}

	return baseTypeStr;
};

const substituteTypeVar = (
	typeVar: string,
	substitution: Map<string, Type>,
	constraint: Constraint
): Constraint => {
	const varType = substitute({ kind: 'variable', name: typeVar }, substitution);
	return {
		...constraint,
		typeVar: varType.kind === 'variable' ? varType.name : typeVar,
	};
};

// Helper function to deduplicate constraints
function deduplicateConstraints(
	constraints: Constraint[],
	substitution: Map<string, Type>
): Constraint[] {
	const result: Constraint[] = [];

	for (const constraint of constraints) {
		// Apply substitution to both constraint and existing constraints before comparison
		const substitutedConstraint = substituteTypeVar(
			constraint.typeVar,
			substitution,
			constraint
		);

		// Special handling for structural constraints that might be semantically duplicate
		// even if they have different field type variables
		const isDuplicate = result.some(c => {
			const substitutedC = substituteTypeVar(c.typeVar, substitution, c);

			// If both are 'has' constraints with same typeVar and same field structure
			if (
				substitutedC.kind === 'has' &&
				substitutedConstraint.kind === 'has' &&
				substitutedC.typeVar === substitutedConstraint.typeVar
			) {
				const fields1 = Object.keys(substitutedC.structure.fields);
				const fields2 = Object.keys(substitutedConstraint.structure.fields);

				// If they have the same field names, consider them duplicate regardless of field types
				if (
					fields1.length === fields2.length &&
					fields1.every(field => fields2.includes(field))
				) {
					return true;
				}
			}

			return constraintsEqual(substitutedC, substitutedConstraint);
		});

		if (!isDuplicate) {
			result.push(constraint);
		}
	}

	return result;
}

// Check if a type variable occurs in a type (for occurs check)
export const occursIn = (varName: string, type: Type): boolean => {
	switch (type.kind) {
		case 'variable':
			return type.name === varName;
		case 'function':
			return (
				type.params.some(param => occursIn(varName, param)) ||
				occursIn(varName, type.return)
			);
		case 'list':
			return occursIn(varName, type.element);
		case 'tuple':
			return type.elements.some(element => occursIn(varName, element));
		case 'record':
			return Object.values(type.fields).some(fieldType =>
				occursIn(varName, fieldType)
			);
		case 'union':
			return type.types.some(t => occursIn(varName, t));
		case 'variant':
			return type.args.some(arg => occursIn(varName, arg));
		case 'constrained': {
			return (
				occursIn(varName, type.baseType) ||
				Array.from(type.constraints.values())
					.flat()
					.some(constraint => {
						if (constraint.kind === 'hasField') {
							return occursIn(varName, constraint.fieldType);
						}
						return false;
					})
			);
		}
		default:
			return false;
	}
};
