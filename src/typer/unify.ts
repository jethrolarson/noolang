import {
	Type,
	Constraint,
	type RecordStructure,
	type TypeKind,
} from '../ast';
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
import { addConstraints, getConstraints } from './constraint-store';
// Legacy constraint imports removed
import { functionApplicationError } from './type-errors';
import { getTypeName } from './trait-system';
import {
	flattenTypeApplication,
	matchConstructorAbstraction,
} from './kinded-constructors';

const sameKind = (
	left: TypeKind | undefined,
	right: TypeKind | undefined
): boolean =>
	left === undefined ||
	right === undefined ||
	JSON.stringify(left) === JSON.stringify(right);

const unifyCallSources = new Map<string, number>(); // Track where unify calls come from
const unifyTypePatterns = new Map<string, number>(); // Track what types are being unified

const typeToPattern = (t: Type): string => {
	if (!t) return 'undefined';
	switch (t.kind) {
		case 'variable':
			return `var:${t.name}`;
		case 'constructor-variable':
			return `ctor-var:${t.name}`;
		case 'type-application':
			return 'type-app';
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
		constraintContext?: Constraint[];
	}
): TypeState => {
	// Add null check for state
	if (!state) {
		throw new Error('Cannot unify with undefined state');
	}

	// Early equality check before substitution for performance
	if (t1 === t2) return state;

	// {} is unit, the empty record, and the empty tuple simultaneously — one
	// type by design. Normalize the degenerate spellings to unit so they unify.
	const normalizeUnit = (t: Type): Type => {
		if (t.kind === 'record' && Object.keys(t.fields).length === 0)
			return { kind: 'unit' };
		if (t.kind === 'tuple' && t.elements.length === 0) return { kind: 'unit' };
		return t;
	};

	const s1 = normalizeUnit(substitute(t1, state.substitution));
	const s2 = normalizeUnit(substitute(t2, state.substitution));

	if (typesEqual(s1, s2)) return state;

	// Constructor abstractions reduce before the ordinary first-order cases.
	if (
		context?.constraintContext &&
		(isTypeKind(s1, 'type-application') ||
			isTypeKind(s2, 'type-application'))
	) {
		const constraintResult = tryUnifyConstrainedApplication(
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

	if (isTypeKind(s1, 'constructor-variable')) {
		if (isTypeKind(s2, 'constructor-variable') || isTypeKind(s2, 'constructor')) {
			const rightKind =
				s2.kind === 'constructor-variable'
					? s2.typeKind
					: s2.abstraction.typeKind;
			if (!sameKind(s1.typeKind, rightKind)) {
				throw new Error('Constructor kind mismatch');
			}
			const substitution = new Map(state.substitution);
			substitution.set(s1.name, s2);
			return { ...state, substitution };
		}
	}
	if (isTypeKind(s2, 'constructor-variable')) {
		if (isTypeKind(s1, 'constructor')) {
			if (!sameKind(s2.typeKind, s1.abstraction.typeKind)) {
				throw new Error('Constructor kind mismatch');
			}
			const substitution = new Map(state.substitution);
			substitution.set(s2.name, s1);
			return { ...state, substitution };
		}
	}

	if (
		isTypeKind(s1, 'type-application') &&
		isTypeKind(s2, 'type-application')
	) {
		let nextState = unify(
			s1.constructor,
			s2.constructor,
			state,
			location,
			context
		);
		nextState = unify(
			s1.argument,
			s2.argument,
			nextState,
			location,
			context
		);
		return nextState;
	}

	// Handle function types
	if (isTypeKind(s1, 'function') && isTypeKind(s2, 'function')) {
		return unifyFunction(s1, s2, state, location, context);
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

	// Handle union with non-union type
	if (isTypeKind(s1, 'union') || isTypeKind(s2, 'union')) {
		return unifyUnionWithType(s1, s2, state, location, context);
	}

	// Handle primitive types
	if (isTypeKind(s1, 'primitive') && isTypeKind(s2, 'primitive')) {
		return unifyPrimitive(s1, s2, state, location);
	}

	// Handle unit types
	if (isTypeKind(s1, 'unit') && isTypeKind(s2, 'unit')) {
		return unifyUnit(s1, s2, state, location);
	}

	// Handle unknown types
	if (isTypeKind(s1, 'unknown') && isTypeKind(s2, 'unknown')) {
		return state; // Unknown types unify with each other
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
		constraintContext?: Constraint[];
	}
): TypeState => {
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

	return unifyInternal(t1, t2, state, location, context);
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

	// Check if all types in s1 are assignable to types in s2
	// For union unification to succeed, every type in s1 must be unifiable with at least one type in s2
	for (const type1 of s1.types) {
		let canUnify = false;

		// Try to unify type1 with each type in s2
		for (const type2 of s2.types) {
			try {
				// Test unification without modifying state
				unify(type1, type2, state, location);
				canUnify = true;
				break;
			} catch {
				// This type doesn't unify, try next
				continue;
			}
		}

		if (!canUnify) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Union type mismatch: type ${typeToString(type1, state.substitution)} from first union cannot be unified with any type in second union ${typeToString(s2, state.substitution)}`,
						{
							expectedType: s2,
							actualType: type1,
							suggestion: `The type ${typeToString(type1, state.substitution)} is not compatible with any of the types in ${typeToString(s2, state.substitution)}. Check your type definitions.`,
						},
						location || { line: 1, column: 1 }
					)
				)
			);
		}
	}

	return state;
}

function unifyUnionWithType(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: {
		reason?: string;
		operation?: string;
		hint?: string;
		constraintContext?: Constraint[];
	}
): TypeState {
	// Determine which is the union type and which is the other type
	const [unionType, otherType] = isTypeKind(s1, 'union') ? [s1, s2] : [s2, s1];
	const unionIsFirst = isTypeKind(s1, 'union');

	// Check for subtyping with context awareness
	if (!isTypeKind(otherType, 'union')) {
		const isOperator = context?.reason === 'operator_application';
		const isFunctionApp = context?.reason === 'function_application';

		// For operators, always require pattern matching on union types
		if (isOperator && unionIsFirst) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Cannot directly use operators on union types. Use pattern matching to narrow the type first.`,
						{
							expectedType: otherType,
							actualType: unionType,
							suggestion: `Union types like ${typeToString(unionType, state.substitution)} require pattern matching before operations. Try:
	match value (
		String s => /* handle string case */;
		Float f => /* handle float case */
	)`,
						},
						location || { line: 1, column: 1 }
					)
				)
			);
		}

		// For function applications, only reject the unsafe union -> concrete direction
		if (isFunctionApp && !unionIsFirst) {
			// s1 = expected (concrete), s2 = actual (union)
			// This is the case: f(val) where f expects Float but val is String | Float
			throw new Error(
				formatTypeError(
					createTypeError(
						`Cannot directly apply functions to union types. Use pattern matching to narrow the type first.`,
						{
							expectedType: otherType, // The concrete type (Float)
							actualType: unionType, // The union type (String | Float)
							suggestion: `Union types like ${typeToString(unionType, state.substitution)} require pattern matching before function application.`,
						},
						location || { line: 1, column: 1 }
					)
				)
			);
		}

		// For general cases, only allow concrete -> union (safe direction)
		if (!unionIsFirst) {
			// concrete -> union: safe subtyping direction
			if (unionType.kind === 'union') {
				for (const memberType of unionType.types) {
					try {
						// Test unification without modifying state
						unify(otherType, memberType, state, location, context);
						// If we get here, unification succeeded - the types are compatible
						return state;
					} catch {
						// This member doesn't unify, try next
						continue;
					}
				}
			}
		} else {
			// union -> concrete: only allow in very specific safe contexts
			// For now, be restrictive to maintain soundness
			throw new Error(
				formatTypeError(
					createTypeError(
						`Cannot unify union type with concrete type. Use pattern matching to narrow the type first.`,
						{
							expectedType: otherType,
							actualType: unionType,
							suggestion: `Union types like ${typeToString(unionType, state.substitution)} require pattern matching to be narrowed to specific types.`,
						},
						location || { line: 1, column: 1 }
					)
				)
			);
		}

		// If we reach here, concrete -> union failed (no union member matched)
		const memberTypesStr =
			unionType.kind === 'union'
				? unionType.types
						.map((t: Type) => typeToString(t, state.substitution))
						.join(' | ')
				: typeToString(unionType, state.substitution);
		throw new Error(
			formatTypeError(
				createTypeError(
					`Type mismatch: ${typeToString(otherType, state.substitution)} is not compatible with union type (${memberTypesStr})`,
					{
						expectedType: unionType,
						actualType: otherType,
						suggestion: `The type ${typeToString(otherType, state.substitution)} must be one of: ${memberTypesStr}`,
					},
					location || { line: 1, column: 1 }
				)
			)
		);
	}

	// If we reach here, we have either:
	// 1. union -> concrete (should require pattern matching)
	// 2. Both are union types (handled by unifyUnion)

	// Provide context-specific error message for operations that require pattern matching
	const isOperator = context?.reason === 'operator_application';
	const isFunctionApp = context?.reason === 'function_application';

	let message: string;
	let suggestion: string;

	if (isOperator) {
		message = `Cannot directly use operators on union types. Use pattern matching to narrow the type first.`;
		suggestion = `Union types like ${typeToString(unionType, state.substitution)} require pattern matching before operations. Try:
	match value (
		String s => /* handle string case */;
		Float f => /* handle float case */
	)`;
	} else if (isFunctionApp) {
		message = `Cannot directly apply functions to union types. Use pattern matching to narrow the type first.`;
		suggestion = `Union types like ${typeToString(unionType, state.substitution)} require pattern matching before function application.`;
	} else {
		message = `Cannot unify union type with concrete type. Use pattern matching to narrow the type first.`;
		suggestion = `Union types like ${typeToString(unionType, state.substitution)} require pattern matching to be narrowed to specific types.`;
	}

	throw new Error(
		formatTypeError(
			createTypeError(
				message,
				{
					expectedType: otherType,
					actualType: unionType,
					suggestion,
				},
				location || { line: 1, column: 1 }
			)
		)
	);
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

/**
 * Check a concrete type against a structural constraint, recursing into nested
 * structures.
 *
 * A nested structure is what a chained accessor composes to — `p has {@address
 * {@city b}}` — so validation has to descend into `@address` and check the inner
 * record too. This previously threw "Nested record structures not yet
 * implemented", which was survivable only because nested constraints never
 * reached unification.
 */
export function validateStructuralConstraint(
	actual: Type,
	structure: RecordStructure,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	const required = Object.keys(structure.fields).map(f => `@${f}`);

	if (!isTypeKind(actual, 'record')) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`Cannot access ${required.join(', ')} on ${typeToString(
						actual,
						state.substitution
					)}`,
					{
						actualType: actual,
						suggestion: `Field access requires a record with ${required.join(
							', '
						)}.`,
					},
					location || { line: 1, column: 1 }
				)
			)
		);
	}

	let newState = state;

	for (const [fieldName, expectedFieldType] of Object.entries(
		structure.fields
	)) {
		if (!(fieldName in actual.fields)) {
			const present = Object.keys(actual.fields).map(f => `@${f}`);
			throw new Error(
				formatTypeError(
					createTypeError(
						`Record has no field @${fieldName}`,
						{
							actualType: actual,
							suggestion:
								present.length > 0
									? `This record has ${present.join(
											', '
										)}. Check the field name.`
									: `This record has no fields.`,
						},
						location || { line: 1, column: 1 }
					)
				)
			);
		}

		const actualFieldType = substitute(
			actual.fields[fieldName],
			newState.substitution
		);

		if (expectedFieldType.kind === 'nested') {
			newState = validateStructuralConstraint(
				actualFieldType,
				expectedFieldType.structure,
				newState,
				location
			);
		} else {
			newState = unify(actualFieldType, expectedFieldType, newState, location);
		}
	}

	return newState;
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
	// Collect the constraints s1 carries, walking its substitution chain.
	//
	// Both sources are read. The store is authoritative — it is keyed by NAME and
	// so survives the structure-copying that instantiation performs. The variable
	// OBJECTS are still consulted because parts of the typer (typeAccessor,
	// propagateConstraintToTypeVariable, the type printer) continue to hang
	// constraints there, and a constraint recorded only on an object would
	// otherwise stop being enforced.
	const constraintsToCheck: Constraint[] = [];
	const pushUnique = (c: Constraint) => {
		if (!constraintsToCheck.some(existing => constraintsEqual(c, existing))) {
			constraintsToCheck.push(c);
		}
	};
	const seenVars = new Set<string>();
	let currentVar: Type = s1;
	while (isTypeKind(currentVar, 'variable')) {
		if (seenVars.has(currentVar.name)) break;
		seenVars.add(currentVar.name);
		currentVar.constraints?.forEach(pushUnique);
		getConstraints(state.constraints, currentVar.name, state.substitution).forEach(
			pushUnique
		);
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
	const newSubstitution = mapSet(state.substitution, s1.name, s2);

	// Carry s1's constraints over to s2 in the name-keyed store, mirroring the
	// object-level merge above. Binding s1 := s2 makes s2 the representative, so
	// s1's constraints become s2's. Constraints already recorded against s1's own
	// name are included: the object-level chain walk above only sees constraints
	// that happen to hang off the variable OBJECTS it can reach.
	let newConstraints = state.constraints;
	// Read s1's entry against the OLD substitution: under the new one s1 already
	// resolves to s2, which would hand back s2's own constraints instead.
	const storedForS1 = getConstraints(
		state.constraints,
		s1.name,
		state.substitution
	);
	const carried = [...constraintsToCheck, ...storedForS1];
	if (isTypeKind(s2, 'variable') && carried.length > 0) {
		newConstraints = addConstraints(
			newConstraints,
			s2.name,
			carried,
			newSubstitution
		);
	}

	let newState = {
		...state,
		substitution: newSubstitution,
		constraints: newConstraints,
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
				newState = validateStructuralConstraint(
					s2,
					constraint.structure,
					newState,
					location
				);
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

const functionUnifyPatterns = new Map<string, number>();

function unifyFunction(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: {
		reason?: string;
		operation?: string;
		hint?: string;
		constraintContext?: Constraint[];
	}
): TypeState {
	if (!isTypeKind(s1, 'function') || !isTypeKind(s2, 'function')) {
		throw new Error('unifyFunction called with non-function types');
	}
	const pattern = `${s1.params.length}p_${s2.params.length}p`;
	functionUnifyPatterns.set(
		pattern,
		(functionUnifyPatterns.get(pattern) || 0) + 1
	);

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
		// Check for constraint on s1.params[i] (variable with constraint) and s2.params[i] (concrete)
		const param1 = s1.params[i];
		const param2 = s2.params[i];
		// Only check for 'implements' constraints
		if (
			param1.kind === 'variable' &&
			param1.constraints &&
			param1.constraints.length > 0 &&
			param2.kind !== 'variable'
		) {
			for (const constraint of param1.constraints) {
				if (constraint.kind === 'implements') {
					const traitRegistry = state.traitRegistry;
					const traitImpls = traitRegistry.implementations.get(
						constraint.interfaceName
					);
					const typeName = getTypeName(param2);
					if (!traitImpls || !typeName || !traitImpls.has(typeName)) {
						throw new Error(
							`Type ${typeName} does not implement trait ${constraint.interfaceName} (required by type variable ${param1.name})`
						);
					}
				}
			}
		}
		// Now unify as usual
		currentState = unify(param1, param2, currentState, location, context);
	}
	currentState = unify(s1.return, s2.return, currentState, location, context);

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
		const currentState = unify(s1.baseType, s2.baseType, state, location);

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

function tryUnifyConstrainedApplication(
	s1: Type,
	s2: Type,
	state: TypeState,
	location?: { line: number; column: number },
	context?: { constraintContext?: Constraint[] }
): TypeState | null {
	if (!context?.constraintContext) return null;
	const application =
		s1.kind === 'type-application'
			? s1
			: s2.kind === 'type-application'
				? s2
				: null;
	if (!application) return null;
	const concreteType = application === s1 ? s2 : s1;
	const flattened = flattenTypeApplication(application);
	if (flattened.constructor.kind !== 'constructor-variable') return null;
	const constructorName = flattened.constructor.name;
	const constraint = context.constraintContext.find(
		candidate =>
			candidate.kind === 'implements' && candidate.typeVar === constructorName
	);
	if (!constraint || constraint.kind !== 'implements') return null;

	if (concreteType.kind === 'variable') {
		const substitution = new Map(state.substitution);
		substitution.set(concreteType.name, application);
		return { ...state, substitution };
	}
	if (concreteType.kind === 'type-application') {
		return unify(application, concreteType, state, location);
	}
	if (concreteType.kind === 'constrained') {
		return unify(application, concreteType.baseType, state, location);
	}

	const concreteTypeName = getTypeName(concreteType);
	const implementation = state.traitRegistry.implementations
		.get(constraint.interfaceName)
		?.get(concreteTypeName);
	const abstraction = implementation?.constructorAbstraction;
	const bindings = abstraction
		? matchConstructorAbstraction(abstraction, concreteType)
		: null;
	if (!abstraction || !bindings) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`No implementation of ${constraint.interfaceName} for ${concreteTypeName}; implement it with an explicit constructor abstraction`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	}
	const substitution = new Map(state.substitution);
	substitution.set(constructorName, { kind: 'constructor', abstraction, bindings });
	return unify(
		substitute(application, substitution),
		concreteType,
		{ ...state, substitution },
		location
	);
}

function containsTypeVariable(type: Type): boolean {
	switch (type.kind) {
		case 'variable':
		case 'constructor-variable':
			return true;
		case 'type-application':
			return (
				containsTypeVariable(type.constructor) ||
				containsTypeVariable(type.argument)
			);
		case 'function':
			return (
				type.params.some(containsTypeVariable) ||
				containsTypeVariable(type.return)
			);
		case 'list':
			return containsTypeVariable(type.element);
		case 'tuple':
			return type.elements.some(containsTypeVariable);
		case 'record':
			return Object.values(type.fields).some(containsTypeVariable);
		case 'union':
			return type.types.some(containsTypeVariable);
		case 'variant':
			return type.args.some(containsTypeVariable);
		case 'constrained':
			return containsTypeVariable(type.baseType);
		default:
			return false;
	}
}

function unifyConstrainedWithConcrete(
	constrainedType: Type & { kind: 'constrained' },
	concreteType: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState {
	if (concreteType.kind === 'type-application') {
		return unify(constrainedType.baseType, concreteType, state, location);
	}
	if (concreteType.kind === 'variable') {
		return unify(concreteType, constrainedType.baseType, state, location);
	}
	const constraintDescribesOnlyInputs = !containsTypeVariable(
		constrainedType.baseType
	);
	if (constraintDescribesOnlyInputs) {
		return unify(constrainedType.baseType, concreteType, state, location);
	}

	const concreteTypeName = getTypeName(concreteType);
	const baseApplication = flattenTypeApplication(constrainedType.baseType);
	const constructorVariable =
		baseApplication.constructor.kind === 'constructor-variable'
			? baseApplication.constructor.name
			: null;
	const entry = Array.from(constrainedType.constraints.entries())
		.flatMap(([typeVar, constraints]) =>
			constraints.map(constraint => ({ typeVar, constraint }))
		)
		.find(
			({ typeVar, constraint }) =>
				constraint.kind === 'implements' &&
				(constructorVariable === null || typeVar === constructorVariable)
		);
	if (!entry || entry.constraint.kind !== 'implements') {
		throw new Error(`No resolvable constraints found for ${concreteTypeName}`);
	}
	if (constructorVariable === null) {
		const implementation = state.traitRegistry.implementations
			.get(entry.constraint.interfaceName)
			?.get(concreteTypeName);
		if (!implementation) {
			throw new Error(
				`No implementation of ${entry.constraint.interfaceName} for ${concreteTypeName}`
			);
		}
		const substitution = new Map(state.substitution);
		substitution.set(entry.typeVar, concreteType);
		return unify(
			substitute(constrainedType.baseType, substitution),
			concreteType,
			{ ...state, substitution },
			location
		);
	}
	const implementation = state.traitRegistry.implementations
		.get(entry.constraint.interfaceName)
		?.get(concreteTypeName);
	const abstraction = implementation?.constructorAbstraction;
	const bindings = abstraction
		? matchConstructorAbstraction(abstraction, concreteType)
		: null;
	if (!abstraction || !bindings) {
		throw new Error(
			formatTypeError(
				createTypeError(
					`No implementation of ${entry.constraint.interfaceName} for ${concreteTypeName}; implement it with an explicit constructor abstraction`,
					{},
					location || { line: 1, column: 1 }
				)
			)
		);
	}
	const substitution = new Map(state.substitution);
	substitution.set(entry.typeVar, { kind: 'constructor', abstraction, bindings });
	const substitutedBaseType = substitute(
		constrainedType.baseType,
		substitution
	);
	return unify(
		substitutedBaseType,
		concreteType,
		{ ...state, substitution },
		location
	);
}
