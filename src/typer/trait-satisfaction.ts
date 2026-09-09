import type { ConstraintExpr, Type } from '../ast';
import { substitute } from './substitute';
import type { TraitImplementation, TraitRegistry } from './trait-system';
import type { TypeState } from './types';

export type TraitSatisfaction =
	| { kind: 'registered'; implementation: TraitImplementation }
	| { kind: 'derived-eq' }
	| { kind: 'unresolved'; typeVars: string[] }
	| { kind: 'missing' };

type SatisfactionState = Pick<
	TypeState,
	'substitution' | 'environment' | 'adtRegistry' | 'traitRegistry'
>;

const unresolvedTypeVars = (type: Type): string[] => {
	if (type.kind === 'variable' || type.kind === 'constructor-variable') return [type.name];
	if (type.kind === 'type-application') return [
		...unresolvedTypeVars(type.constructor),
		...unresolvedTypeVars(type.argument),
	];
	return [];
};

const mergeTypeVars = (...groups: string[][]): string[] => [...new Set(groups.flat())];

const resolveAliases = (
	type: Type,
	state: SatisfactionState,
	seen = new Set<string>()
): Type => {
	const resolved = substitute(type, state.substitution);
	if (resolved.kind === 'variant') {
		if (state.adtRegistry.has(resolved.name)) {
			return {
				...resolved,
				args: resolved.args.map(arg =>
					resolveAliases(arg, state, new Set(seen))
				),
			};
		}
		const scheme = state.environment.get(resolved.name);
		if (
			scheme &&
			!seen.has(resolved.name) &&
			scheme.quantifiedVars.length === resolved.args.length
		) {
			seen.add(resolved.name);
			const bindings = new Map<string, Type>();
			scheme.quantifiedVars.forEach((name, index) =>
				bindings.set(name, resolved.args[index])
			);
			return resolveAliases(substitute(scheme.type, bindings), state, seen);
		}
		return {
			...resolved,
			args: resolved.args.map(arg => resolveAliases(arg, state, new Set(seen))),
		};
	}
	if (resolved.kind === 'tuple')
		return {
			...resolved,
			elements: resolved.elements.map(t =>
				resolveAliases(t, state, new Set(seen))
			),
		};
	if (resolved.kind === 'record')
		return {
			...resolved,
			fields: Object.fromEntries(
				Object.entries(resolved.fields).map(([k, v]) => [
					k,
					resolveAliases(v, state, new Set(seen)),
				])
			),
		};
	if (resolved.kind === 'list')
		return {
			...resolved,
			element: resolveAliases(resolved.element, state, new Set(seen)),
		};
	return resolved;
};

const bindTarget = (
	pattern: Type,
	actual: Type,
	bindings: Map<string, Type>
): boolean => {
	if (pattern.kind === 'variable') {
		const existing = bindings.get(pattern.name);
		if (!existing) {
			bindings.set(pattern.name, actual);
			return true;
		}
		return JSON.stringify(existing) === JSON.stringify(actual);
	}
	if (pattern.kind !== actual.kind) return false;
	switch (pattern.kind) {
		case 'primitive':
			return actual.kind === 'primitive' && pattern.name === actual.name;
		case 'unit':
			return true;
		case 'list':
			return (
				actual.kind === 'list' &&
				bindTarget(pattern.element, actual.element, bindings)
			);
		case 'variant':
			return (
				actual.kind === 'variant' &&
				pattern.name === actual.name &&
				pattern.args.length === actual.args.length &&
				pattern.args.every((p, i) => bindTarget(p, actual.args[i], bindings))
			);
		case 'tuple':
			return (
				actual.kind === 'tuple' &&
				pattern.elements.length === actual.elements.length &&
				pattern.elements.every((p, i) =>
					bindTarget(p, actual.elements[i], bindings)
				)
			);
		case 'record':
			return (
				actual.kind === 'record' &&
				Object.keys(pattern.fields).length ===
					Object.keys(actual.fields).length &&
				Object.entries(pattern.fields).every(
					([k, p]) =>
						k in actual.fields && bindTarget(p, actual.fields[k], bindings)
				)
			);
		default:
			return JSON.stringify(pattern) === JSON.stringify(actual);
	}
};

const nominalName = (type: Type): string | null => {
	if (type.kind === 'primitive' || type.kind === 'variant') return type.name;
	if (type.kind === 'list') return 'List';
	if (type.kind === 'unit') return 'Unit';
	return null;
};

const satisfyGiven = (
	constraint: ConstraintExpr,
	bindings: Map<string, Type>,
	state: SatisfactionState,
	memo: Map<string, 'checking' | TraitSatisfaction>
): TraitSatisfaction => {
	if (constraint.kind === 'paren')
		return satisfyGiven(constraint.expr, bindings, state, memo);
	if (constraint.kind === 'and') {
		const left = satisfyGiven(constraint.left, bindings, state, memo);
		if (left.kind === 'missing') return left;
		const right = satisfyGiven(constraint.right, bindings, state, memo);
		if (right.kind === 'missing') return right;
		return left.kind === 'unresolved' || right.kind === 'unresolved'
			? {
					kind: 'unresolved',
					typeVars: mergeTypeVars(
						left.kind === 'unresolved' ? left.typeVars : [],
						right.kind === 'unresolved' ? right.typeVars : []
					),
				}
			: { kind: 'derived-eq' };
	}
	if (constraint.kind === 'or')
		throw new Error(
			"Conditional trait constraints using 'or' have no defined resolution semantics"
		);
	if (constraint.kind !== 'implements') return { kind: 'missing' };
	const bound = bindings.get(constraint.typeVar);
	return bound
		? satisfyTrait(constraint.interfaceName, bound, state, memo)
		: { kind: 'unresolved', typeVars: [constraint.typeVar] };
};

export const satisfyTrait = (
	traitName: string,
	input: Type,
	state: SatisfactionState,
	memo = new Map<string, 'checking' | TraitSatisfaction>()
): TraitSatisfaction => {
	const type = resolveAliases(input, state);
	const key = `${traitName}:${JSON.stringify(type)}`;
	const cached = memo.get(key);
	if (cached === 'checking') return { kind: 'derived-eq' };
	if (cached) return cached;
	memo.set(key, 'checking');

	const name = nominalName(type);
	const implementation = name
		? state.traitRegistry.implementations.get(traitName)?.get(name)
		: undefined;
	if (implementation) {
		const bindings = new Map<string, Type>();
		const targetMatches =
			!implementation.givenConstraints ||
			!implementation.targetType ||
			bindTarget(implementation.targetType, type, bindings);
		if (targetMatches) {
			const given = implementation.givenConstraints
				? satisfyGiven(implementation.givenConstraints, bindings, state, memo)
				: { kind: 'derived-eq' as const };
			const result: TraitSatisfaction =
				given.kind === 'missing'
					? { kind: 'missing' }
					: given.kind === 'unresolved'
						? given
						: { kind: 'registered', implementation };
			memo.set(key, result);
			return result;
		}
	}

	if (
		type.kind === 'variable' ||
		type.kind === 'constructor-variable' ||
		type.kind === 'type-application'
	) {
		const result: TraitSatisfaction = {
			kind: 'unresolved',
			typeVars: unresolvedTypeVars(type),
		};
		memo.set(key, result);
		return result;
	}
	if (type.kind === 'constrained')
		return satisfyTrait(traitName, type.baseType, state, memo);

	if (traitName === 'Eq') {
		let components: Type[] | null = null;
		if (type.kind === 'tuple') components = type.elements;
		if (type.kind === 'record') components = Object.values(type.fields);
		if (type.kind === 'variant') {
			const adt = state.adtRegistry.get(type.name);
			if (adt) {
				const bindings = new Map<string, Type>();
				adt.typeParams.forEach((param, i) => bindings.set(param, type.args[i]));
				components = Array.from(adt.constructors.values())
					.flat()
					.map(payload => substitute(payload, bindings));
			}
		}
		if (components) {
			const results = components.map(component =>
				satisfyTrait('Eq', component, state, memo)
			);
			const result: TraitSatisfaction = results.some(r => r.kind === 'missing')
				? { kind: 'missing' }
				: results.some(r => r.kind === 'unresolved')
					? {
							kind: 'unresolved',
							typeVars: mergeTypeVars(
								...results.map(r => r.kind === 'unresolved' ? r.typeVars : [])
							),
						}
					: { kind: 'derived-eq' };
			memo.set(key, result);
			return result;
		}
	}
	const result: TraitSatisfaction = { kind: 'missing' };
	memo.set(key, result);
	return result;
};
