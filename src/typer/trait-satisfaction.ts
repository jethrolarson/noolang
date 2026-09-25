import type { ConstraintExpr, Type } from '../ast';
import { substitute } from './substitute';
import { typesEqual } from './helpers';
import type { TraitImplementation } from './trait-system';
import type { TypeState } from './types';

export type TraitSatisfaction =
	| { kind: 'registered'; implementation: TraitImplementation }
	| { kind: 'derived-eq' }
	| { kind: 'unresolved'; typeVars: ReadonlySet<string> }
	| { kind: 'missing' };

type SatisfactionState = Pick<
	TypeState,
	'substitution' | 'environment' | 'adtRegistry' | 'traitRegistry'
>;

const unresolvedTypeVars = (type: Type): ReadonlySet<string> => {
	if (type.kind === 'variable' || type.kind === 'constructor-variable') {
		return new Set([type.name]);
	}
	if (type.kind === 'type-application') {
		return mergeTypeVars(
			unresolvedTypeVars(type.constructor),
			unresolvedTypeVars(type.argument)
		);
	}
	return new Set();
};

const mergeTypeVars = (
	...groups: Iterable<string>[]
): ReadonlySet<string> => new Set(groups.flatMap(group => [...group]));

const resolveAliases = (
	type: Type,
	state: SatisfactionState,
	seen = new Set<string>()
): Type => {
	const resolved = substitute(type, state.substitution);
	if (resolved.kind !== 'variant' || state.adtRegistry.has(resolved.name)) {
		return resolved;
	}
	const scheme = state.environment.get(resolved.name);
	if (
		!scheme ||
		seen.has(resolved.name) ||
		scheme.quantifiedVars.length !== resolved.args.length
	) {
		return resolved;
	}
	seen.add(resolved.name);
	const bindings = new Map(
		scheme.quantifiedVars.map((name, index) => [name, resolved.args[index]])
	);
	return resolveAliases(substitute(scheme.type, bindings), state, seen);
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
		return typesEqual(existing, actual);
	}
	if (pattern.kind !== actual.kind) return false;
	switch (pattern.kind) {
		case 'list':
			return actual.kind === 'list' &&
				bindTarget(pattern.element, actual.element, bindings);
		case 'variant':
			return actual.kind === 'variant' &&
				pattern.name === actual.name &&
				bindTargets(pattern.args, actual.args, bindings);
		case 'tuple':
			return actual.kind === 'tuple' &&
				bindTargets(pattern.elements, actual.elements, bindings);
		case 'record':
			return actual.kind === 'record' &&
				Object.keys(pattern.fields).length === Object.keys(actual.fields).length &&
				Object.entries(pattern.fields).every(([name, field]) =>
					Object.hasOwn(actual.fields, name) &&
					bindTarget(field, actual.fields[name], bindings)
				);
		case 'function':
			return actual.kind === 'function' &&
				bindTargets(pattern.params, actual.params, bindings) &&
				bindTarget(pattern.return, actual.return, bindings);
		case 'type-application':
			return actual.kind === 'type-application' &&
				bindTarget(pattern.constructor, actual.constructor, bindings) &&
				bindTarget(pattern.argument, actual.argument, bindings);
		case 'union':
			return actual.kind === 'union' &&
				bindTargets(pattern.types, actual.types, bindings);
		case 'constrained':
			return actual.kind === 'constrained' &&
				bindTarget(pattern.baseType, actual.baseType, bindings);
		default:
			return typesEqual(pattern, actual);
	}
};

const bindTargets = (
	patterns: Type[],
	actuals: Type[],
	bindings: Map<string, Type>
): boolean => patterns.length === actuals.length &&
	patterns.every((pattern, index) =>
		bindTarget(pattern, actuals[index], bindings)
	);

const typeKey = (type: Type): string => {
	switch (type.kind) {
		case 'variable':
		case 'constructor-variable': return `${type.kind}:${type.name}`;
		case 'primitive': return type.name;
		case 'unit': return 'Unit';
		case 'function': return 'function';
		case 'type-application': return `${typeKey(type.constructor)}(${typeKey(type.argument)})`;
		case 'constructor': {
			const bindings = [...type.bindings.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([name, value]) => `${name}:${typeKey(value)}`);
			return `constructor:${type.abstraction.nominalName}:${bindings.join(',')}`;
		}
		case 'list': return `List(${typeKey(type.element)})`;
		case 'tuple': return `{${type.elements.map(typeKey).join(',')}}`;
		case 'record': {
			const fields = Object.keys(type.fields)
				.sort()
				.map(name => `${name}:${typeKey(type.fields[name])}`);
			return `{${fields.join(',')}}`;
		}
		case 'variant': return `${type.name}(${type.args.map(typeKey).join(',')})`;
		case 'union': return type.types.map(typeKey).join('|');
		case 'constrained': return typeKey(type.baseType);
		default: return type.kind;
	}
};

const satisfactionKey = (traitName: string, type: Type): string =>
	`${traitName}:${typeKey(type)}`;

const nominalName = (type: Type): string | null => {
	if (type.kind === 'primitive' || type.kind === 'variant') return type.name;
	if (type.kind === 'list') return 'List';
	if (type.kind === 'unit') return 'Unit';
	return null;
};

const combineSatisfactions = (
	results: TraitSatisfaction[]
): TraitSatisfaction => {
	if (results.some(result => result.kind === 'missing')) return { kind: 'missing' };
	const unresolved = results.filter(
		(result): result is Extract<TraitSatisfaction, { kind: 'unresolved' }> =>
			result.kind === 'unresolved'
	);
	return unresolved.length > 0
		? { kind: 'unresolved', typeVars: mergeTypeVars(...unresolved.map(result => result.typeVars)) }
		: { kind: 'derived-eq' };
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
		return combineSatisfactions([
			satisfyGiven(constraint.left, bindings, state, memo),
			satisfyGiven(constraint.right, bindings, state, memo),
		]);
	}
	if (constraint.kind === 'or')
		throw new Error(
			"Conditional trait constraints using 'or' have no defined resolution semantics"
		);
	if (constraint.kind !== 'implements') return { kind: 'missing' };
	const bound = bindings.get(constraint.typeVar);
	return bound
		? satisfyTrait(constraint.interfaceName, bound, state, memo)
		: { kind: 'unresolved', typeVars: new Set([constraint.typeVar]) };
};

const structuralEqComponents = (
	type: Type,
	state: SatisfactionState
): Type[] | null => {
	if (type.kind === 'tuple') return type.elements;
	if (type.kind === 'record') return Object.values(type.fields);
	if (type.kind !== 'variant') return null;
	const adt = state.adtRegistry.get(type.name);
	if (!adt) return null;
	const bindings = new Map(
		adt.typeParams.map((param, index) => [param, type.args[index]])
	);
	return [...adt.constructors.values()]
		.flat()
		.map(payload => substitute(payload, bindings));
};

export const satisfyTrait = (
	traitName: string,
	input: Type,
	state: SatisfactionState,
	memo = new Map<string, 'checking' | TraitSatisfaction>()
): TraitSatisfaction => {
	const type = resolveAliases(input, state);
	const name = nominalName(type);
	const implementation = name
		? state.traitRegistry.implementations.get(traitName)?.get(name)
		: undefined;
	if (implementation) {
		const bindings = new Map<string, Type>();
		if (
			implementation.targetType &&
			!bindTarget(implementation.targetType, type, bindings)
		) {
			return { kind: 'missing' };
		}
		if (implementation.givenConstraints) {
			const given = satisfyGiven(
				implementation.givenConstraints,
				bindings,
				state,
				memo
			);
			if (given.kind === 'missing' || given.kind === 'unresolved') return given;
		}
		return { kind: 'registered', implementation };
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
		return result;
	}
	if (type.kind === 'constrained')
		return satisfyTrait(traitName, type.baseType, state, memo);

	if (traitName === 'Eq') {
		const key = type.kind === 'variant'
			? satisfactionKey(traitName, type)
			: null;
		const cached = key ? memo.get(key) : undefined;
		if (cached === 'checking') return { kind: 'derived-eq' };
		if (cached) return cached;
		if (key) memo.set(key, 'checking');

		const components = structuralEqComponents(type, state);
		if (components) {
			const result = combineSatisfactions(
				components.map(component => satisfyTrait('Eq', component, state, memo))
			);
			if (key) memo.set(key, result);
			return result;
		}
	}
	return { kind: 'missing' };
};
