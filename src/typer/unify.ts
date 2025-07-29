import { Type, TraitConstraint, VariantType, Constraint, RecordStructure, StructureFieldType } from '../ast';
import { substitute } from './substitute';
import { TypeState } from './types';
import { isTypeKind, typesEqual, constraintsEqual } from './helpers';
import {
	formatTypeError,
	createTypeError,
	operatorTypeError,
	unificationError,
} from './type-errors';
import { mapSet, typeToString, occursIn } from './helpers';
// Legacy constraint imports removed
import { functionApplicationError } from './type-errors';
import { getTypeName } from './trait-system';

// Valid primitive type names (must match PrimitiveType['name'] union)
const VALID_PRIMITIVES = new Set(['Float', 'String', 'Bool', 'List'] as const);
type ValidPrimitiveName = 'Float' | 'String' | 'Bool' | 'List';

// Type guard for valid primitive names
function isValidPrimitiveName(name: string): name is ValidPrimitiveName {
	return VALID_PRIMITIVES.has(name as ValidPrimitiveName);
}

// Performance tracking
let unifyCallCount = 0;
let totalUnifyTime = 0;
const slowUnifyCalls: Array<{ type1: string; type2: string; time: number }> =
	[];
const unifyCallSources = new Map<string, number>(); // Track where unify calls come from
const unifyTypePatterns = new Map<string, number>(); // Track what types are being unified

// Enhanced logging functionality
let testStartCount = 0;
let testStartTime = 0;

export const resetUnificationCounters = () => {
	testStartCount = unifyCallCount;
	testStartTime = totalUnifyTime;
};

export const getUnificationStats = () => {
	const callsSinceReset = unifyCallCount - testStartCount;
	const timeSinceReset = totalUnifyTime - testStartTime;
	
	if (callsSinceReset > 0) {
		const topSources = Array.from(unifyCallSources.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		
		const topPatterns = Array.from(unifyTypePatterns.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		
		return {
			calls: callsSinceReset,
			time: timeSinceReset,
			totalCalls: unifyCallCount,
			totalTime: totalUnifyTime,
			topSources,
			topPatterns,
			slowCalls: slowUnifyCalls.length
		};
	}
	
	return null;
};

export const logUnificationStats = (testName?: string) => {
	const stats = getUnificationStats();
	if (stats && stats.calls > 1000) { // Only log if significant number of calls
		const prefix = testName ? `[${testName}] ` : '';
		console.warn(
			`${prefix}Unify: ${stats.calls} calls, ${stats.time}ms, ${stats.slowCalls} slow calls`
		);
		if (stats.calls > 5000) {
			console.warn(`${prefix}Top unify call sources:`, stats.topSources);
			console.warn(`${prefix}Most repeated unifications:`, stats.topPatterns);
		}
	}
	return stats;
};

const typeToPattern = (t: Type): string => {
	switch (t.kind) {
		case 'variable':
			return `var:${t.name}`;
		case 'primitive':
			return `prim:${t.name}`;
		case 'function':
			return `fn:${t.params.length}p`;
		case 'list':
			return `list`;
		case 'record':
			return `rec:${Object.keys(t.fields).length}f`;
		case 'tuple':
			return `tup:${t.elements.length}e`;
		case 'variant':
			return `var:${t.name}:${t.args.length}a`;
		default:
			return t.kind;
	}
};

const unifyInternal = (
	t1: Type,
	t2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: {
		reason?: string;
		operation?: string;
		hint?: string;
		constraintContext?: Map<string, TraitConstraint[]>;
	}
): TypeState => {
	// Early equality check before substitution for performance
	if (t1 === t2) return state;

	const s1 = substitute(t1, state.substitution);
	const s2 = substitute(t2, state.substitution);

	// PHASE 3: Constraint resolution debug logging (can be removed in production)
	// if (context?.reason === 'function_application' && (s1.kind === 'variant' || s2.kind === 'variant')) {
	// 	console.log('PHASE 3: Constraint unification:', s1.kind, 'with', s2.kind);
	// }

	if (typesEqual(s1, s2)) return state;

	// PHASE 3: Handle constraint resolution EARLY to provide better error messages
	// Check if one type is a variant with a constrained type variable name
	if (
		context?.constraintContext &&
		(isTypeKind(s1, 'variant') || isTypeKind(s2, 'variant'))
	) {
		const constraintResult = tryUnifyConstrainedVariant(
			s1,
			s2,
			state,
			location,
			context
		);
		if (constraintResult) {
			return constraintResult;
		}
	}

	// Handle variables (either order)
	if (isTypeKind(s1, 'variable')) return unifyVariable(s1, s2, state, location);
	if (isTypeKind(s2, 'variable')) return unifyVariable(s2, s1, state, location);

	// Handle function types
	if (isTypeKind(s1, 'function') && isTypeKind(s2, 'function')) {
		return unifyFunction(s1, s2, state, location);
	}

	// Handle list types
	if (isTypeKind(s1, 'list') && isTypeKind(s2, 'list')) {
		return unifyList(s1, s2, state, location);
	}

	// Handle tuple types
	if (isTypeKind(s1, 'tuple') && isTypeKind(s2, 'tuple')) {
		return unifyTuple(s1, s2, state, location);
	}

	// Handle record types
	if (isTypeKind(s1, 'record') && isTypeKind(s2, 'record')) {
		return unifyRecord(s1, s2, state, location);
	}

	// Handle union types
	if (isTypeKind(s1, 'union') && isTypeKind(s2, 'union')) {
		return unifyUnion(s1, s2, state, location);
	}

	// Handle primitive types
	if (isTypeKind(s1, 'primitive') && isTypeKind(s2, 'primitive')) {
		return unifyPrimitive(s1, s2, state, location);
	}

	// Handle unit types
	if (isTypeKind(s1, 'unit') && isTypeKind(s2, 'unit')) {
		return unifyUnit(s1, s2, state, location);
	}

	// Handle variant types (ADTs like Option, Result, etc.)
	if (isTypeKind(s1, 'variant') && isTypeKind(s2, 'variant')) {
		return unifyVariant(s1, s2, state, location);
	}

	// Handle constrained types
	if (isTypeKind(s1, 'constrained') || isTypeKind(s2, 'constrained')) {
		return unifyConstrained(s1, s2, state, location);
	}

	// If we get here, the types cannot be unified
	// Add debug info for difficult cases
	const debugContext = context || {};
	if (
		s1.kind === 'primitive' &&
		s2.kind === 'primitive' &&
		s1.name === s2.name
	) {
		debugContext.reason = 'concrete_vs_variable';
		debugContext.hint = `Both types appear to be ${
			s1.name
		} but they are not unifying. This suggests the type equality check is failing. Type 1: ${JSON.stringify(
			s1
		)}, Type 2: ${JSON.stringify(
			s2
		)}. Check if there are extra properties or constraints causing inequality.`;
	}

	throw new Error(
		formatTypeError(
			unificationError(s1, s2, debugContext, location || { line: 1, column: 1 })
		)
	);
};

export const unify = (
	t1: Type,
	t2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: {
		reason?: string;
		operation?: string;
		hint?: string;
		constraintContext?: Map<string, TraitConstraint[]>;
	}
): TypeState => {
	const start = Date.now();
	unifyCallCount++;

	// Track call sources using stack trace
	const stack = new Error().stack || '';
	const caller = stack.split('\n')[2] || 'unknown';
	const source = caller.includes('at ')
		? caller.split('at ')[1].split(' ')[0]
		: 'unknown';
	unifyCallSources.set(source, (unifyCallSources.get(source) || 0) + 1);

	// Track type patterns being unified
	const pattern = `${typeToPattern(t1)} = ${typeToPattern(t2)}`;
	unifyTypePatterns.set(pattern, (unifyTypePatterns.get(pattern) || 0) + 1);

	const result = unifyInternal(t1, t2, state, location, context);

	const time = Date.now() - start;
	totalUnifyTime += time;

	if (time > 10) {
		slowUnifyCalls.push({
			type1: `${t1.kind}:${t1.kind === 'variable' ? t1.name : '?'}`,
			type2: `${t2.kind}:${t2.kind === 'variable' ? t2.name : '?'}`,
			time,
		});
	}

	if (unifyCallCount % 5000 === 0) {
		console.warn(
			`Unify: ${unifyCallCount} calls, ${totalUnifyTime}ms total, ${slowUnifyCalls.length} slow calls`
		);

		// Show top call sources
		const topSources = Array.from(unifyCallSources.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		console.warn('Top unify call sources:', topSources);

		// Show most repeated type patterns
		const topPatterns = Array.from(unifyTypePatterns.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		console.warn('Most repeated unifications:', topPatterns);
	}

	return result;
};

function unifyUnion(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'union') || !isTypeKind(s2, 'union')) {
		throw new Error('unifyUnion called with non-union types');
	}
	// For now, require exact match of union types
	if (s1.types.length !== s2.types.length)
		throw new Error(
			formatTypeError(
				createTypeError(
					`Union type mismatch: ${s1.types.length} vs ${s2.types.length} types`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	let currentState = state;
	for (let i = 0; i < s1.types.length; i++) {
		currentState = unify(s1.types[i], s2.types[i], currentState, location);
	}
	return currentState;
}

function unifyPrimitive(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'primitive') || !isTypeKind(s2, 'primitive')) {
		throw new Error('unifyPrimitive called with non-primitive types');
	}
	if (s1.name !== s2.name)
		throw new Error(
			formatTypeError(
				operatorTypeError('', s1, s2, location || { line: 1, column: 1 })
			)
		);
	return state;
}

function unifyUnit(
	s1: Type,
	s2: Type,
	state: TypeState,
	_location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'unit') || !isTypeKind(s2, 'unit')) {
		throw new Error('unifyUnit called with non-unit types');
	}
	return state;
}

// --- Unification helpers ---
function unifyVariable(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'variable')) {
		throw new Error('unifyVariable called with non-variable s1');
	}
	// Optimized constraint collection - avoid array spreading
	const constraintsToCheck: Constraint[] = [];
	const seenVars = new Set<string>();
	let currentVar: Type = s1;
	while (isTypeKind(currentVar, 'variable')) {
		if (seenVars.has(currentVar.name)) break;
		seenVars.add(currentVar.name);
		if (currentVar.constraints) {
			// Use forEach instead of spread for better performance
			currentVar.constraints.forEach(c => constraintsToCheck.push(c));
		}
		const next = state.substitution.get(currentVar.name);
		if (!next) break;
		currentVar = next;
	}
	// If s2 is a variable, merge all constraints into it
	if (isTypeKind(s2, 'variable')) {
		s2.constraints = s2.constraints || [];
		// Optimized constraint merging - use efficient constraint comparison
		for (const c of constraintsToCheck) {
			if (!s2.constraints.some(existing => constraintsEqual(c, existing))) {
				s2.constraints.push(c);
			}
		}
	}
	// Occurs check
	if (occursIn(s1.name, s2))
		throw new Error(
			formatTypeError(
				createTypeError(
					`Occurs check failed: ${s1.name} occurs in ${typeToString(
						s2,
						state.substitution
					)}`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	let newState = {
		...state,
		substitution: mapSet(state.substitution, s1.name, s2),
	};
	// If s2 is not a variable, propagate or check constraints
	if (!isTypeKind(s2, 'variable')) {
		for (const constraint of constraintsToCheck) {
			if (constraint.kind === 'hasField' && isTypeKind(s2, 'record')) {
				newState = unify(
					s2.fields[constraint.field],
					constraint.fieldType,
					newState,
					location
				);
			} else if (constraint.kind === 'has') {
				if (isTypeKind(s2, 'record')) {
					// Validate that s2 has all required fields with correct types
					for (const [fieldName, expectedFieldType] of Object.entries(
						constraint.structure.fields
					)) {
						if (!(fieldName in s2.fields)) {
							throw new Error(
								`Record missing required field @${fieldName} for constraint ${constraint.typeVar} has {${Object.keys(
									constraint.structure.fields
								)
									.map(f => `@${f}`)
									.join(', ')}}`
							);
						}

						// Handle StructureFieldType (can be Type or nested structure)
						if (
							typeof expectedFieldType === 'object' &&
							expectedFieldType !== null &&
							'kind' in expectedFieldType
						) {
							if (expectedFieldType.kind === 'nested') {
								// TODO: Handle nested record structures
								throw new Error('Nested record structures not yet implemented');
							} else {
								// It's a regular Type
								newState = unify(
									s2.fields[fieldName],
									expectedFieldType as Type,
									newState,
									location
								);
							}
						} else {
							throw new Error(
								`Invalid field type in constraint: ${typeof expectedFieldType}`
							);
						}
					}
				} else {
					// s2 is not a record type, but the constraint requires record structure
					const fieldNames = Object.keys(constraint.structure.fields)
						.map(f => `@${f}`)
						.join(', ');
					throw new Error(
						`Type ${s2.kind === 'primitive' ? s2.name : s2.kind} cannot satisfy constraint ${constraint.typeVar} has {${fieldNames}} - expected a record type`
					);
				}
			} else if (constraint.kind === 'is') {
				// NOTE: Legacy constraint checking removed - handled by new trait system
				// TODO: Implement proper constraint checking in Phase 2
			} else {
				// NOTE: Legacy constraint propagation removed - handled by new trait system
				// TODO: Implement proper constraint checking in Phase 2
			}
		}
	}
	return newState;
}

let functionUnifyCount = 0;
const functionUnifyPatterns = new Map<string, number>();

function unifyFunction(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'function') || !isTypeKind(s2, 'function')) {
		throw new Error('unifyFunction called with non-function types');
	}

	functionUnifyCount++;
	const pattern = `${s1.params.length}p_${s2.params.length}p`;
	functionUnifyPatterns.set(
		pattern,
		(functionUnifyPatterns.get(pattern) || 0) + 1
	);

	if (functionUnifyCount % 1000 === 0) {
		console.warn(
			`Function unify: ${functionUnifyCount} calls, top patterns:`,
			Array.from(functionUnifyPatterns.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3)
		);
	}

	if (s1.params.length !== s2.params.length)
		throw new Error(
			formatTypeError(
				functionApplicationError(
					s1,
					s2,
					0,
					undefined,
					location || { line: 1, column: 1 }
				)
			)
		);

	let currentState = state;

	// First, propagate function-level constraints to the relevant type variables
	// NOTE: Legacy constraint propagation removed - handled by new trait system

	// Then unify parameters and return types
	for (let i = 0; i < s1.params.length; i++) {
		// NOTE: Legacy constraint merging removed - handled by new trait system
		currentState = unify(s1.params[i], s2.params[i], currentState, location);
	}
	currentState = unify(s1.return, s2.return, currentState, location);

	return currentState;
}

function unifyList(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'list') || !isTypeKind(s2, 'list')) {
		throw new Error('unifyList called with non-list types');
	}
	return unify(s1.element, s2.element, state, location);
}

function unifyTuple(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'tuple') || !isTypeKind(s2, 'tuple')) {
		throw new Error('unifyTuple called with non-tuple types');
	}
	if (s1.elements.length !== s2.elements.length)
		throw new Error(
			formatTypeError(
				createTypeError(
					`Tuple length mismatch: ${s1.elements.length} vs ${s2.elements.length}`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	let currentState = state;
	for (let i = 0; i < s1.elements.length; i++) {
		currentState = unify(
			s1.elements[i],
			s2.elements[i],
			currentState,
			location
		);
	}
	return currentState;
}

function unifyVariant(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'variant') || !isTypeKind(s2, 'variant')) {
		throw new Error('unifyVariant called with non-variant types');
	}

	// Variant types must have the same name (e.g., both "Option")
	if (s1.name !== s2.name) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`Variant name mismatch: ${s1.name} vs ${s2.name}`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	}

	// Variant types must have the same number of type arguments
	if (s1.args.length !== s2.args.length) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`Variant arity mismatch: ${s1.name} has ${s1.args.length} vs ${s2.args.length} type arguments`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	}

	// Unify corresponding type arguments
	let currentState = state;
	for (let i = 0; i < s1.args.length; i++) {
		currentState = unify(s1.args[i], s2.args[i], currentState, location);
	}
	return currentState;
}

function unifyRecord(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (!isTypeKind(s1, 'record') || !isTypeKind(s2, 'record')) {
		throw new Error('unifyRecord called with non-record types');
	}
	const keys1 = Object.keys(s1.fields);
	let currentState = state;
	for (const key of keys1) {
		if (!(key in s2.fields))
			throw new Error(
				formatTypeError(
					createTypeError(
						`Required field missing: ${key}`,
						{},
						location || { line: 1, column: 1 }
					)
				)
			);
		currentState = unify(
			s1.fields[key],
			s2.fields[key],
			currentState,
			location
		);
	}
	return currentState;
}

function unifyConstrained(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	// Handle constrained type unification
	if (isTypeKind(s1, 'constrained') && isTypeKind(s2, 'constrained')) {
		// Both are constrained - unify base types and merge constraints
		let currentState = unify(s1.baseType, s2.baseType, state, location);

		// For now, just merge constraints (simple conjunction)
		// TODO: More sophisticated constraint merging
		const mergedConstraints = new Map(s1.constraints);
		for (const [varName, constraints] of s2.constraints) {
			const existing = mergedConstraints.get(varName) || [];
			mergedConstraints.set(varName, [...existing, ...constraints]);
		}

		return currentState;
	} else if (isTypeKind(s1, 'constrained')) {
		// PHASE 3: s1 is constrained, s2 is not - attempt constraint resolution
		return unifyConstrainedWithConcrete(s1, s2, state, location);
	} else if (isTypeKind(s2, 'constrained')) {
		// PHASE 3: s2 is constrained, s1 is not - attempt constraint resolution
		return unifyConstrainedWithConcrete(s2, s1, state, location);
	}

	throw new Error('unifyConstrained called with non-constrained types');
}

// PHASE 3: Try to unify a variant type with a constrained type variable against a concrete type
function tryUnifyConstrainedVariant(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: {
		reason?: string;
		operation?: string;
		hint?: string;
		constraintContext?: Map<string, TraitConstraint[]>;
	}
): TypeState | null {
	// Only proceed if we have constraint context
	if (!context?.constraintContext) {
		return null;
	}

	let variantType: Type & { kind: 'variant' };
	let concreteType: Type;

	if (isTypeKind(s1, 'variant') && !isTypeKind(s2, 'variant')) {
		variantType = s1;
		concreteType = s2;
	} else if (isTypeKind(s2, 'variant') && !isTypeKind(s1, 'variant')) {
		variantType = s2;
		concreteType = s1;
	} else if (isTypeKind(s1, 'variant') && isTypeKind(s2, 'variant')) {
		// Both are variants - check if one is a constrained type variable
		const s1Name = s1.name;
		const s2Name = s2.name;

		// Check if s1 is a constrained type variable
		if (context.constraintContext.has(s1Name)) {
			variantType = s1;
			concreteType = s2;
		} else if (context.constraintContext.has(s2Name)) {
			variantType = s2;
			concreteType = s1;
		} else {
			return null; // Neither variant is constrained
		}
	} else {
		return null; // Neither is variant
	}

	// Check if this variant type variable has constraints
	const constraints = context.constraintContext.get(variantType.name);
	if (!constraints) {
		return null; // No constraints on this type variable
	}

	const concreteTypeName = getTypeName(concreteType);
	const traitRegistry = state.traitRegistry;
	if (!traitRegistry) {
		return null;
	}

	// Special case: if concreteType is also a type variable, check for constraint compatibility
	if (
		concreteType.kind === 'variable' ||
		(concreteType.kind === 'variant' && concreteTypeName.startsWith('α')) ||
		(concreteType.kind === 'constrained' && concreteTypeName.startsWith('α'))
	) {
		// Both are type variables - we can unify them by propagating constraints
		// For now, substitute the variant type with the concrete type
		const newSubstitution = new Map(state.substitution);
		newSubstitution.set(variantType.name, concreteType);
		return { ...state, substitution: newSubstitution };
	}

	// Check if any constraint can be satisfied by the concrete type
	for (const constraint of constraints) {
		if (constraint.kind === 'implements') {
			const traitName = constraint.trait;
			const traitImpls = traitRegistry.implementations.get(traitName);

			if (traitImpls && traitImpls.has(concreteTypeName)) {
				// Constraint is satisfied! Perform the substitution
				const newSubstitution = new Map(state.substitution);

				if (concreteType.kind === 'list') {
					// For List types, substitute the type constructor
					newSubstitution.set(variantType.name, {
						kind: 'primitive',
						name: 'List',
					});

					// Transform α130 Float -> List Float
					const substitutedVariant = substitute(variantType, newSubstitution);

					if (
						substitutedVariant.kind === 'variant' &&
						substitutedVariant.name === 'List' &&
						substitutedVariant.args.length === 1
					) {
						// Create the proper List type
						const listType = {
							kind: 'list' as const,
							element: substitutedVariant.args[0],
						};

						// Check if types match
						if (concreteType.kind === 'list') {
							// Unify the element types
							const elementUnificationState = unify(
								listType.element,
								concreteType.element,
								{ ...state, substitution: newSubstitution },
								location
							);
							return elementUnificationState;
						}
					}
				}

				// PHASE 3 FIX: Handle variant types like Option, Result, etc.
				if (concreteType.kind === 'variant') {
					const concreteVariant = concreteType; // Type-safe access
					
					// Validate that we're not trying to create an invalid primitive
					if (isValidPrimitiveName(concreteVariant.name)) {
						// Only valid primitives can be substituted as primitives
						newSubstitution.set(variantType.name, {
							kind: 'primitive',
							name: concreteVariant.name, // TypeScript now knows this is ValidPrimitiveName
						});
					} else {
						// For non-primitive variants (Option, Result, etc.), substitute with the variant type itself
						newSubstitution.set(variantType.name, concreteVariant);
					}

					// Transform α130 Float -> Option Float (variant)
					const substitutedVariant = substitute(variantType, newSubstitution);

					if (
						substitutedVariant.kind === 'variant' &&
						substitutedVariant.name === concreteVariant.name &&
						substitutedVariant.args &&
						concreteVariant.args &&
						substitutedVariant.args.length === concreteVariant.args.length
					) {
						// Unify the type arguments
						let currentState = { ...state, substitution: newSubstitution };
						for (let i = 0; i < substitutedVariant.args.length; i++) {
							currentState = unify(
								substitutedVariant.args[i],
								concreteVariant.args[i],
								currentState,
								location
							);
						}
						return currentState;
					}
				}

				// For other types, try direct substitution
				newSubstitution.set(variantType.name, concreteType);
				return { ...state, substitution: newSubstitution };
			} else {
				// Constraint not satisfied - throw specific error
				throw new Error(
					formatTypeError(
						createTypeError(
							`No implementation of ${traitName} for ${concreteTypeName}`,
							{
								suggestion:
									`The constraint '${variantType.name} implements ${traitName}' cannot be satisfied by ${concreteTypeName}. ` +
									`You need to add: implement ${traitName} ${concreteTypeName} (...)`,
							},
							location || { line: 1, column: 1 }
						)
					)
				);
			}
		}
	}

	return null; // No constraint resolution possible
}

// PHASE 3: Constraint resolution during unification
function unifyConstrainedWithConcrete(
	constrainedType: Type & { kind: 'constrained' },
	concreteType: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	// Get the concrete type name for trait lookup
	const concreteTypeName = getTypeName(concreteType);
	
	// Find which constrained type variable can be resolved to the concrete type
	let resolvedVarName: string | null = null;
	let resolvedConstraint: string | null = null;
	
	// Check each constraint to see if the concrete type satisfies it
	for (const [varName, constraints] of constrainedType.constraints) {
		for (const constraint of constraints) {
			if (constraint.kind === 'implements') {
				const traitName = constraint.trait;
				
				// Check if we have an implementation of this trait for the concrete type
				const traitRegistry = state.traitRegistry;
				if (!traitRegistry) {
					throw new Error(
						formatTypeError(
							createTypeError(
								`No trait registry available for constraint resolution`,
								{},
								location || { line: 1, column: 1 }
							)
						)
					);
				}
				
				const traitImpls = traitRegistry.implementations.get(traitName);
				if (!traitImpls || !traitImpls.has(concreteTypeName)) {
					throw new Error(
						formatTypeError(
							createTypeError(
								`No implementation of ${traitName} for ${concreteTypeName}`,
								{
									suggestion: `The constraint '${varName} implements ${traitName}' cannot be satisfied by ${concreteTypeName}. ` +
										       `You need to add: implement ${traitName} ${concreteTypeName} (...)`
								},
								location || { line: 1, column: 1 }
							)
						)
					);
				}
				
				// This constraint is satisfied - remember it for substitution
				resolvedVarName = varName;
				resolvedConstraint = traitName;
			}
		}
	}
	
	if (!resolvedVarName) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`No resolvable constraints found for ${concreteTypeName}`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	}
	
	// Create substitution mapping the constrained variable to the concrete type constructor
	const newSubstitution = new Map(state.substitution);
	
	// CONSTRAINT COLLAPSE FIX: When we have a concrete type that satisfies the constraint,
	// we should substitute the type variable with the concrete type constructor
	
	if (concreteType.kind === 'list') {
		// For List Float, we substitute the type constructor variable with List
		newSubstitution.set(resolvedVarName, { kind: 'primitive', name: 'List' });
	} else if (concreteType.kind === 'variant') {
		// For Option Float, Maybe String, etc., we need to substitute with a type constructor
		// We can't create a primitive with variant name, so we substitute with the variant type itself
		// but extract just the constructor part
		newSubstitution.set(resolvedVarName, {
			kind: 'variant',
			name: concreteType.name,
			args: [] // Empty args since this is just the constructor
		});
	} else {
		// For other types, substitute directly
		newSubstitution.set(resolvedVarName, concreteType);
	}
	
	const newState = { ...state, substitution: newSubstitution };
	
	// Apply the substitution to the base type
	const substitutedBaseType = substitute(constrainedType.baseType, newSubstitution);
	
	// CRITICAL FIX: Instead of calling unify recursively (which might preserve constraints),
	// check if the substituted base type now equals the concrete type.
	// If so, the constraint is fully resolved and we can return the new state.
	
	// Apply the substitution to make the comparison
	const finalSubstitutedType = substitute(substitutedBaseType, newSubstitution);
	
	// If the types are now equal after substitution, constraint is resolved
	if (typesEqual(finalSubstitutedType, concreteType)) {
		return newState;
	}
	
	// Otherwise, continue with normal unification
	return unify(
		substitutedBaseType,
		concreteType,
		newState,
		location
	);
}
