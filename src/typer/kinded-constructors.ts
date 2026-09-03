import type {
	FunctionType,
	Type,
	TypeConstructorAbstraction,
	TypeConstructorAbstractionExpression,
	TypeConstructorTerm,
	TypeKind,
} from '../ast';
import type { ADTRegistry } from './types';

const TYPE: TypeKind = { kind: 'Type' };

const arrowKind = (arity: number): TypeKind => {
	let result: TypeKind = TYPE;
	for (let index = 0; index < arity; index++) {
		result = { kind: 'arrow', from: TYPE, to: result };
	}
	return result;
};

const nominalBody = (
	body: Type,
	adtRegistry: ADTRegistry
): { name: string; args: Type[]; arity: number } => {
	if (body.kind === 'list')
		return { name: 'List', args: [body.element], arity: 1 };
	if (body.kind !== 'variant') {
		throw new Error('A typefn body must be one saturated nominal constructor');
	}
	const arity = adtRegistry.get(body.name)?.typeParams.length;
	if (arity === undefined)
		throw new Error(`Unknown nominal constructor '${body.name}'`);
	return { name: body.name, args: body.args, arity };
};

const occurrences = (type: Type, name: string): number => {
	if (type.kind === 'variable') return type.name === name ? 1 : 0;
	if (type.kind === 'variant')
		return type.args.reduce((n, arg) => n + occurrences(arg, name), 0);
	if (type.kind === 'list') return occurrences(type.element, name);
	if (type.kind === 'function')
		return [...type.params, type.return].reduce(
			(n, part) => n + occurrences(part, name),
			0
		);
	if (type.kind === 'tuple')
		return type.elements.reduce((n, part) => n + occurrences(part, name), 0);
	if (type.kind === 'record')
		return Object.values(type.fields).reduce(
			(n, part) => n + occurrences(part, name),
			0
		);
	if (type.kind === 'union')
		return type.types.reduce((n, part) => n + occurrences(part, name), 0);
	if (type.kind === 'constrained') return occurrences(type.baseType, name);
	return 0;
};

export const constructorParameterArity = (
	functions: Iterable<Type>,
	parameter: string,
	traitName: string
): number => {
	const arities: number[] = [];
	const visit = (type: Type): void => {
		if (type.kind === 'variant' && type.name === parameter)
			arities.push(type.args.length);
		if (type.kind === 'variant') type.args.forEach(visit);
		else if (type.kind === 'function')
			[...type.params, type.return].forEach(visit);
		else if (type.kind === 'list') visit(type.element);
		else if (type.kind === 'tuple') type.elements.forEach(visit);
		else if (type.kind === 'record') Object.values(type.fields).forEach(visit);
		else if (type.kind === 'union') type.types.forEach(visit);
		else if (type.kind === 'constrained') visit(type.baseType);
	};
	for (const fn of functions) visit(fn);
	if (arities.length === 0) return 0;
	if (arities.some(arity => arity !== arities[0])) {
		throw new Error(
			`Trait '${traitName}' applies '${parameter}' inconsistently`
		);
	}
	return arities[0];
};

export const compileConstructorAbstraction = (
	expression: TypeConstructorAbstractionExpression,
	expectedArity: number,
	adtRegistry: ADTRegistry
): TypeConstructorAbstraction => {
	if (expression.parameters.length !== expectedArity) {
		throw new Error(
			`typefn has ${expression.parameters.length} parameter(s), expected ${expectedArity}`
		);
	}
	const nominal = nominalBody(expression.body, adtRegistry);
	if (nominal.args.length !== nominal.arity) {
		throw new Error(
			`typefn body '${nominal.name}' must be saturated at arity ${nominal.arity}`
		);
	}
	for (const parameter of expression.parameters) {
		const direct = nominal.args.filter(
			arg => arg.kind === 'variable' && arg.name === parameter
		).length;
		if (direct !== 1 || occurrences(expression.body, parameter) !== 1) {
			throw new Error(
				`typefn parameter '${parameter}' must occur exactly once as a direct constructor argument`
			);
		}
	}
	let term: TypeConstructorTerm = {
		kind: 'nominal-constructor',
		name: nominal.name,
		typeKind: arrowKind(nominal.arity),
	};
	for (const argument of nominal.args)
		term = { kind: 'type-application', constructor: term, argument };
	return {
		parameters: expression.parameters,
		body: expression.body,
		term,
		typeKind: arrowKind(expression.parameters.length),
		nominalName: nominal.name,
	};
};

const instantiate = (type: Type, bindings: Map<string, Type>): Type => {
	if (type.kind === 'variable') return bindings.get(type.name) ?? type;
	if (type.kind === 'variant')
		return { ...type, args: type.args.map(arg => instantiate(arg, bindings)) };
	if (type.kind === 'list')
		return { ...type, element: instantiate(type.element, bindings) };
	if (type.kind === 'function')
		return {
			...type,
			params: type.params.map(arg => instantiate(arg, bindings)),
			return: instantiate(type.return, bindings),
		};
	if (type.kind === 'tuple')
		return {
			...type,
			elements: type.elements.map(arg => instantiate(arg, bindings)),
		};
	if (type.kind === 'record')
		return {
			...type,
			fields: Object.fromEntries(
				Object.entries(type.fields).map(([name, field]) => [
					name,
					instantiate(field, bindings),
				])
			),
		};
	if (type.kind === 'union')
		return {
			...type,
			types: type.types.map(arg => instantiate(arg, bindings)),
		};
	if (type.kind === 'constrained')
		return { ...type, baseType: instantiate(type.baseType, bindings) };
	return type;
};

const bindTemplate = (
	template: Type,
	concrete: Type,
	parameters: Set<string>,
	bindings: Map<string, Type>
): boolean => {
	if (template.kind === 'variable') {
		if (parameters.has(template.name)) return true;
		const existing = bindings.get(template.name);
		if (!existing) {
			bindings.set(template.name, concrete);
			return true;
		}
		return JSON.stringify(existing) === JSON.stringify(concrete);
	}
	if (template.kind !== concrete.kind) return false;
	if (template.kind === 'primitive' && concrete.kind === 'primitive')
		return template.name === concrete.name;
	if (template.kind === 'variant' && concrete.kind === 'variant') {
		return (
			template.name === concrete.name &&
			template.args.length === concrete.args.length &&
			template.args.every((arg, index) =>
				bindTemplate(arg, concrete.args[index], parameters, bindings)
			)
		);
	}
	if (template.kind === 'list' && concrete.kind === 'list')
		return bindTemplate(
			template.element,
			concrete.element,
			parameters,
			bindings
		);
	return JSON.stringify(template) === JSON.stringify(concrete);
};

export const matchConstructorAbstraction = (
	abstraction: TypeConstructorAbstraction,
	concrete: Type
): Map<string, Type> | null => {
	const body = abstraction.body;
	const templateArgs =
		body.kind === 'list'
			? [body.element]
			: body.kind === 'variant'
				? body.args
				: [];
	const concreteArgs =
		concrete.kind === 'list' && abstraction.nominalName === 'List'
			? [concrete.element]
			: concrete.kind === 'variant' && concrete.name === abstraction.nominalName
				? concrete.args
				: null;
	if (!concreteArgs || concreteArgs.length !== templateArgs.length) return null;
	const bindings = new Map<string, Type>();
	const parameters = new Set(abstraction.parameters);
	return templateArgs.every((arg, index) =>
		bindTemplate(arg, concreteArgs[index], parameters, bindings)
	)
		? bindings
		: null;
};

export const betaReduce = (
	abstraction: TypeConstructorAbstraction,
	arguments_: Type[],
	bindings: Map<string, Type>
): Type => {
	if (arguments_.length !== abstraction.parameters.length)
		throw new Error('typefn application arity mismatch');
	const applied = new Map(bindings);
	abstraction.parameters.forEach((parameter, index) =>
		applied.set(parameter, arguments_[index])
	);
	return instantiate(abstraction.body, applied);
};

export const reduceTraitApplications = (
	type: Type,
	parameter: string,
	abstraction: TypeConstructorAbstraction,
	bindings: Map<string, Type>
): Type => {
	if (type.kind === 'variant' && type.name === parameter) {
		return betaReduce(
			abstraction,
			type.args.map(arg =>
				reduceTraitApplications(arg, parameter, abstraction, bindings)
			),
			bindings
		);
	}
	if (type.kind === 'variant')
		return {
			...type,
			args: type.args.map(arg =>
				reduceTraitApplications(arg, parameter, abstraction, bindings)
			),
		};
	if (type.kind === 'function')
		return {
			...type,
			params: type.params.map(arg =>
				reduceTraitApplications(arg, parameter, abstraction, bindings)
			),
			return: reduceTraitApplications(
				type.return,
				parameter,
				abstraction,
				bindings
			),
		};
	if (type.kind === 'list')
		return {
			...type,
			element: reduceTraitApplications(
				type.element,
				parameter,
				abstraction,
				bindings
			),
		};
	if (type.kind === 'tuple')
		return {
			...type,
			elements: type.elements.map(arg =>
				reduceTraitApplications(arg, parameter, abstraction, bindings)
			),
		};
	if (type.kind === 'record')
		return {
			...type,
			fields: Object.fromEntries(
				Object.entries(type.fields).map(([name, field]) => [
					name,
					reduceTraitApplications(field, parameter, abstraction, bindings),
				])
			),
		};
	if (type.kind === 'union')
		return {
			...type,
			types: type.types.map(arg =>
				reduceTraitApplications(arg, parameter, abstraction, bindings)
			),
		};
	if (type.kind === 'constrained')
		return {
			...type,
			baseType: reduceTraitApplications(
				type.baseType,
				parameter,
				abstraction,
				bindings
			),
		};
	return type;
};

export const reduceConstructorValue = (
	type: Type,
	arguments_: Type[]
): Type => {
	if (type.kind !== 'constructor') return type;
	return betaReduce(type.abstraction, arguments_, type.bindings);
};
