import type { TraitSlotDescriptor, TraitSlotRole, Type } from '../ast';
import type { ADTRegistry } from './types';
import { typesEqual } from './helpers';

const occurrencesOf = (type: Type, parameter: string): number[] => {
	if (type.kind === 'variable') return type.name === parameter ? [0] : [];
	if (type.kind === 'variant') {
		const here = type.name === parameter ? [type.args.length] : [];
		return here.concat(...type.args.map(arg => occurrencesOf(arg, parameter)));
	}
	if (type.kind === 'function') {
		return type.params
			.concat(type.return)
			.flatMap(part => occurrencesOf(part, parameter));
	}
	if (type.kind === 'list') return occurrencesOf(type.element, parameter);
	if (type.kind === 'tuple')
		return type.elements.flatMap(part => occurrencesOf(part, parameter));
	if (type.kind === 'record')
		return Object.values(type.fields).flatMap(part =>
			occurrencesOf(part, parameter)
		);
	if (type.kind === 'union')
		return type.types.flatMap(part => occurrencesOf(part, parameter));
	if (type.kind === 'constrained')
		return occurrencesOf(type.baseType, parameter);
	return [];
};

export const traitConstructorArity = (
	functions: Iterable<Type>,
	parameter: string,
	traitName: string
): number => {
	const arities = Array.from(functions).flatMap(type =>
		occurrencesOf(type, parameter)
	);
	if (arities.length === 0) {
		throw new Error(
			`Trait '${traitName}' does not use its type parameter '${parameter}'`
		);
	}
	const arity = arities[0];
	if (arities.some(candidate => candidate !== arity)) {
		throw new Error(
			`Trait '${traitName}' applies '${parameter}' inconsistently (${Array.from(new Set(arities)).join(', ')} arguments)`
		);
	}
	return arity;
};

const containsTypeHole = (type: Type): boolean => {
	if (type.kind === 'variable') return type.name === '_';
	if (type.kind === 'variant') return type.args.some(containsTypeHole);
	if (type.kind === 'function')
		return type.params.some(containsTypeHole) || containsTypeHole(type.return);
	if (type.kind === 'list') return containsTypeHole(type.element);
	if (type.kind === 'tuple') return type.elements.some(containsTypeHole);
	if (type.kind === 'record')
		return Object.values(type.fields).some(containsTypeHole);
	if (type.kind === 'union') return type.types.some(containsTypeHole);
	if (type.kind === 'constrained') return containsTypeHole(type.baseType);
	return false;
};

const headArguments = (
	type: Type
): {
	kind: TraitSlotDescriptor['constructorKind'];
	name: string;
	args: Type[];
} => {
	if (type.kind === 'variant')
		return { kind: 'variant', name: type.name, args: type.args };
	if (type.kind === 'list')
		return { kind: 'list', name: 'List', args: [type.element] };
	if (type.kind === 'primitive')
		return { kind: 'primitive', name: type.name, args: [] };
	throw new Error(
		'Trait implementations require a nominal variant, List, Float, or String target'
	);
};

export const createTraitSlotDescriptor = (
	type: Type,
	modeledArity: number,
	adtRegistry: ADTRegistry,
	traitName: string
): TraitSlotDescriptor => {
	const head = headArguments(type);
	const constructorArity =
		head.kind === 'variant'
			? adtRegistry.get(head.name)?.typeParams.length
			: head.kind === 'list'
				? 1
				: 0;
	if (constructorArity === undefined) {
		throw new Error(
			`Unknown ADT '${head.name}' in implementation of '${traitName}'`
		);
	}
	if (head.args.length > constructorArity) {
		throw new Error(
			`Implementation target '${head.name}' has too many type arguments`
		);
	}

	const roles: TraitSlotRole[] = head.args.map(arg => {
		if (arg.kind === 'variable' && arg.name === '_') return { kind: 'modeled' };
		if (containsTypeHole(arg)) {
			throw new Error(
				`Modeled '_' holes in implementation of '${traitName}' must be direct arguments of '${head.name}', not nested inside a fixed argument`
			);
		}
		if (arg.kind === 'variable') return { kind: 'free', type: arg };
		return { kind: 'fixed', type: arg };
	});
	while (roles.length < constructorArity) {
		roles.push({
			kind: 'free',
			type: { kind: 'variable', name: `__${head.name}_free_${roles.length}` },
		});
	}
	const holes = roles.filter(role => role.kind === 'modeled').length;
	if (modeledArity > 0 && holes === 0) {
		throw new Error(
			`Higher-kinded implementation of '${traitName}' for '${head.name}' requires ${modeledArity} explicit '_' slot${modeledArity === 1 ? '' : 's'}`
		);
	}
	if (holes !== modeledArity) {
		throw new Error(
			`Implementation of '${traitName}' for '${head.name}' has ${holes} modeled hole(s), expected ${modeledArity}`
		);
	}
	return { constructorKind: head.kind, typeName: head.name, slots: roles };
};

export const concreteArguments = (
	type: Type,
	descriptor: TraitSlotDescriptor
): Type[] | null => {
	if (descriptor.constructorKind === 'list') {
		return type.kind === 'list' ? [type.element] : null;
	}
	if (descriptor.constructorKind === 'primitive') {
		return type.kind === 'primitive' && type.name === descriptor.typeName
			? []
			: null;
	}
	return type.kind === 'variant' && type.name === descriptor.typeName
		? type.args
		: null;
};

const bindFreeSlots = (
	descriptor: TraitSlotDescriptor,
	args: Type[]
): Map<string, Type> | null => {
	const bindings = new Map<string, Type>();
	for (let index = 0; index < descriptor.slots.length; index++) {
		const role = descriptor.slots[index];
		if (role.kind !== 'free' || role.type.kind !== 'variable') continue;
		const existing = bindings.get(role.type.name);
		if (existing && !typesEqual(existing, args[index])) return null;
		bindings.set(role.type.name, args[index]);
	}
	return bindings;
};

const instantiateFreeVariables = (
	type: Type,
	bindings: Map<string, Type>
): Type => {
	if (type.kind === 'variable') return bindings.get(type.name) ?? type;
	if (type.kind === 'variant')
		return {
			...type,
			args: type.args.map(arg => instantiateFreeVariables(arg, bindings)),
		};
	if (type.kind === 'function')
		return {
			...type,
			params: type.params.map(arg => instantiateFreeVariables(arg, bindings)),
			return: instantiateFreeVariables(type.return, bindings),
		};
	if (type.kind === 'list')
		return {
			...type,
			element: instantiateFreeVariables(type.element, bindings),
		};
	if (type.kind === 'tuple')
		return {
			...type,
			elements: type.elements.map(arg =>
				instantiateFreeVariables(arg, bindings)
			),
		};
	if (type.kind === 'record')
		return {
			...type,
			fields: Object.fromEntries(
				Object.entries(type.fields).map(([name, field]) => [
					name,
					instantiateFreeVariables(field, bindings),
				])
			),
		};
	if (type.kind === 'union')
		return {
			...type,
			types: type.types.map(arg => instantiateFreeVariables(arg, bindings)),
		};
	if (type.kind === 'constrained')
		return {
			...type,
			baseType: instantiateFreeVariables(type.baseType, bindings),
		};
	return type;
};

export const descriptorAccepts = (
	descriptor: TraitSlotDescriptor,
	type: Type
): boolean => {
	const args = concreteArguments(type, descriptor);
	if (!args) return false;
	const bindings = bindFreeSlots(descriptor, args);
	return (
		!!bindings &&
		descriptor.slots.every(
			(role, index) =>
				role.kind !== 'fixed' ||
				typesEqual(instantiateFreeVariables(role.type, bindings), args[index])
		)
	);
};

export const reassembleTraitType = (
	descriptor: TraitSlotDescriptor,
	modeledArguments: Type[],
	preservedArguments?: Type[]
): Type => {
	const construct = (args: Type[]): Type => {
		if (descriptor.constructorKind === 'list')
			return { kind: 'list', element: args[0] };
		if (descriptor.constructorKind === 'primitive')
			return {
				kind: 'primitive',
				name: descriptor.typeName as 'Float' | 'String',
			};
		return { kind: 'variant', name: descriptor.typeName, args };
	};
	// A constructor placeholder can already have been rebuilt by an earlier
	// substitution while retaining its dispatch metadata.
	if (modeledArguments.length === descriptor.slots.length) {
		const bindings = bindFreeSlots(descriptor, modeledArguments) ?? new Map();
		return construct(
			descriptor.slots.map((role, index) =>
				role.kind === 'fixed'
					? instantiateFreeVariables(role.type, bindings)
					: modeledArguments[index]
			)
		);
	}
	const bindings = preservedArguments
		? (bindFreeSlots(descriptor, preservedArguments) ?? new Map())
		: new Map<string, Type>();
	let modeledIndex = 0;
	const args = descriptor.slots.map((role, index) => {
		if (role.kind === 'modeled') return modeledArguments[modeledIndex++];
		if (role.kind === 'fixed')
			return instantiateFreeVariables(role.type, bindings);
		return preservedArguments?.[index] ?? role.type;
	});
	if (modeledIndex !== modeledArguments.length || args.some(arg => !arg)) {
		throw new Error(
			`Trait slot arity mismatch for ${descriptor.typeName}: received ${modeledArguments.length} modeled argument(s)`
		);
	}
	return construct(args);
};

export const expandTraitParameter = (
	type: Type,
	parameter: string,
	descriptor: TraitSlotDescriptor
): Type => {
	if (type.kind === 'variable' && type.name === parameter) {
		return reassembleTraitType(descriptor, []);
	}
	if (type.kind === 'variant' && type.name === parameter) {
		return reassembleTraitType(
			descriptor,
			type.args.map(arg => expandTraitParameter(arg, parameter, descriptor))
		);
	}
	if (type.kind === 'variant')
		return {
			...type,
			args: type.args.map(arg =>
				expandTraitParameter(arg, parameter, descriptor)
			),
		};
	if (type.kind === 'function')
		return {
			...type,
			params: type.params.map(arg =>
				expandTraitParameter(arg, parameter, descriptor)
			),
			return: expandTraitParameter(type.return, parameter, descriptor),
		};
	if (type.kind === 'list')
		return {
			...type,
			element: expandTraitParameter(type.element, parameter, descriptor),
		};
	if (type.kind === 'tuple')
		return {
			...type,
			elements: type.elements.map(arg =>
				expandTraitParameter(arg, parameter, descriptor)
			),
		};
	if (type.kind === 'union')
		return {
			...type,
			types: type.types.map(arg =>
				expandTraitParameter(arg, parameter, descriptor)
			),
		};
	if (type.kind === 'record')
		return {
			...type,
			fields: Object.fromEntries(
				Object.entries(type.fields).map(([name, field]) => [
					name,
					expandTraitParameter(field, parameter, descriptor),
				])
			),
		};
	if (type.kind === 'constrained')
		return {
			...type,
			baseType: expandTraitParameter(type.baseType, parameter, descriptor),
		};
	return type;
};
