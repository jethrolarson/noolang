import type { Constraint, Type } from '../ast';
import { constraintsEqual } from './helpers';

/**
 * Structural constraints keyed by type-variable NAME.
 *
 * The typer's original scheme hangs constraints off type-variable OBJECTS and
 * propagates them by mutating those objects during unification
 * (`unifyVariable`). That works only while every reference to a variable is the
 * same object — an invariant the code no longer maintains: instantiation
 * deep-copies constraint structures (`freshenRecordStructure`), so a
 * constraint's `α216` and the `α216` that unification mutates can be different
 * objects. Chained accessors lose their link that way.
 *
 * Keying by name, and resolving through the substitution, removes the
 * dependency on object identity entirely.
 *
 * The store is persistent: every mutator returns a new map, matching how
 * `TypeState.substitution` is threaded.
 */
export type ConstraintStore = Map<string, Constraint[]>;

export const createConstraintStore = (): ConstraintStore => new Map();

/**
 * Follow the substitution to the variable's representative name.
 *
 * A variable bound to another variable shares its constraints; the last
 * variable in the chain is the canonical key. A variable bound to a concrete
 * type has no representative variable, so the chain stops at the last variable
 * name — the caller decides what a concrete binding means.
 */
export const resolveVarName = (
	name: string,
	substitution: Map<string, Type>
): string => {
	let current = name;
	const seen = new Set<string>();
	while (!seen.has(current)) {
		seen.add(current);
		const next = substitution.get(current);
		if (!next || next.kind !== 'variable') break;
		current = next.name;
	}
	return current;
};

export const getConstraints = (
	store: ConstraintStore,
	varName: string,
	substitution: Map<string, Type>
): Constraint[] => store.get(resolveVarName(varName, substitution)) ?? [];

export const addConstraint = (
	store: ConstraintStore,
	varName: string,
	constraint: Constraint,
	substitution: Map<string, Type>
): ConstraintStore => {
	const key = resolveVarName(varName, substitution);
	const existing = store.get(key) ?? [];
	if (existing.some(c => constraintsEqual(c, constraint))) return store;
	const next = new Map(store);
	next.set(key, [...existing, constraint]);
	return next;
};

export const addConstraints = (
	store: ConstraintStore,
	varName: string,
	constraints: Constraint[],
	substitution: Map<string, Type>
): ConstraintStore => {
	let next = store;
	for (const constraint of constraints) {
		next = addConstraint(next, varName, constraint, substitution);
	}
	return next;
};
