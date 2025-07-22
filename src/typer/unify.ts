import { Type } from '../ast';
import { substitute } from './substitute';
import { TypeState } from './types';
import { isTypeKind, typesEqual, constraintsEqual } from './helpers';
import {
	formatTypeError,
	createTypeError,
	operatorTypeError,
	unificationError,
} from './type-errors';
import { Constraint } from '../ast';
import { mapSet, typeToString, occursIn } from './helpers';
import { satisfiesConstraint, propagateConstraintToType } from './constraints';
import { functionApplicationError } from './type-errors';

// Performance tracking
let unifyCallCount = 0;
let totalUnifyTime = 0;
const slowUnifyCalls: Array<{ type1: string; type2: string; time: number }> =
	[];
const unifyCallSources = new Map<string, number>(); // Track where unify calls come from
const unifyTypePatterns = new Map<string, number>(); // Track what types are being unified

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
	}
): TypeState => {
	// Early equality check before substitution for performance
	if (t1 === t2) return state;

	const s1 = substitute(t1, state.substitution);
	const s2 = substitute(t2, state.substitution);

	if (typesEqual(s1, s2)) return state;

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

	// If we get here, the types cannot be unified
	// Add debug info for difficult cases
	const debugContext = context || {};
	if (
		s1.kind === s2.kind &&
		s1.kind === 'primitive' &&
		(s1 as any).name === (s2 as any).name
	) {
		debugContext.reason = 'concrete_vs_variable';
		debugContext.hint = `Both types appear to be ${
			(s1 as any).name
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
			} else if (constraint.kind === 'is') {
				if (isTypeKind(s2, 'primitive')) {
					if (!satisfiesConstraint(s2, constraint.constraint)) {
						throw new Error(
							formatTypeError(
								createTypeError(
									`Type ${typeToString(
										s2,
										state.substitution
									)} does not satisfy constraint '${
										constraint.constraint
									}'. This error typically occurs when attempting to use a partial function (one that can fail) in an unsafe context like function composition. Consider using total functions that return Option or Result types instead.`,
									{},
									location || { line: 1, column: 1 }
								)
							)
						);
					}
				} else {
					// Propagate the constraint recursively to all type variables inside s2
					propagateConstraintToType(s2, constraint);
				}
			} else {
				// For other constraint kinds, propagate recursively
				propagateConstraintToType(s2, constraint);
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
	if (s1.constraints) {
		for (const constraint of s1.constraints) {
			// Propagate to all type variables in s1
			propagateConstraintToType(s1, constraint);
		}
	}

	if (s2.constraints) {
		for (const constraint of s2.constraints) {
			// Propagate to all type variables in s2
			propagateConstraintToType(s2, constraint);
		}
	}

	// Then unify parameters and return types
	for (let i = 0; i < s1.params.length; i++) {
		// Skip expensive constraint propagation for non-variables
		const s1var = s1.params[i];
		const s2var = s2.params[i];
		if (
			isTypeKind(s1var, 'variable') &&
			isTypeKind(s2var, 'variable') &&
			(s1var.constraints?.length || s2var.constraints?.length)
		) {
			s1var.constraints = s1var.constraints || [];
			s2var.constraints = s2var.constraints || [];
			// Optimized constraint merging using efficient comparison
			// Propagate s1 -> s2
			for (const c of s1var.constraints) {
				if (
					!s2var.constraints.some(existing => constraintsEqual(c, existing))
				) {
					s2var.constraints.push(c);
				}
			}
			// Propagate s2 -> s1
			for (const c of s2var.constraints) {
				if (
					!s1var.constraints.some(existing => constraintsEqual(c, existing))
				) {
					s1var.constraints.push(c);
				}
			}
		}
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
