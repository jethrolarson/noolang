import type {
	Type,
	TypeConstructorAbstraction,
	TypeConstructorAbstractionExpression,
	TypeKind,
} from '../ast';
import type { ADTRegistry } from './types';

const TYPE: TypeKind = { kind: 'Type' };

export const arrowKind = (arity: number): TypeKind => {
	let kind: TypeKind = TYPE;
	for (let index = 0; index < arity; index++) {
		kind = { kind: 'arrow', from: TYPE, to: kind };
	}
	return kind;
};

export const flattenTypeApplication = (
	type: Type
): { constructor: Type; arguments: Type[] } => {
	const arguments_: Type[] = [];
	let constructor = type;
	while (constructor.kind === 'type-application') {
		arguments_.unshift(constructor.argument);
		constructor = constructor.constructor;
	}
	return { constructor, arguments: arguments_ };
};

export const constructorParameterArity = (
	functionTypes: Iterable<Type>,
	parameter: string,
	traitName: string
): number => {
	const arities: number[] = [];
	const visit = (type: Type): void => {
		switch (type.kind) {
			case 'type-application': {
				const application = flattenTypeApplication(type);
				if (
					application.constructor.kind === 'constructor-variable' &&
					application.constructor.name === parameter
				) {
					arities.push(application.arguments.length);
					application.arguments.forEach(visit);
				} else {
					visit(type.constructor);
					visit(type.argument);
				}
				return;
			}
			case 'function':
				type.params.forEach(visit);
				visit(type.return);
				return;
			case 'variant':
				type.args.forEach(visit);
				return;
			case 'list':
				visit(type.element);
				return;
			case 'tuple':
				type.elements.forEach(visit);
				return;
			case 'record':
				Object.values(type.fields).forEach(visit);
				return;
			case 'union':
				type.types.forEach(visit);
				return;
			case 'constrained':
				visit(type.baseType);
		}
	};
	for (const type of functionTypes) visit(type);
	if (arities.some(arity => arity !== arities[0])) {
		throw new Error(
			`Trait '${traitName}' applies '${parameter}' inconsistently`
		);
	}
	return arities[0] ?? 0;
};

export const annotateConstructorKind = (
	type: Type,
	parameter: string,
	typeKind: TypeKind
): Type => {
	switch (type.kind) {
		case 'constructor-variable':
			return type.name === parameter ? { ...type, typeKind } : type;
		case 'type-application':
			return {
				...type,
				constructor: annotateConstructorKind(
					type.constructor,
					parameter,
					typeKind
				),
				argument: annotateConstructorKind(type.argument, parameter, typeKind),
			};
		case 'function':
			return {
				...type,
				params: type.params.map(part =>
					annotateConstructorKind(part, parameter, typeKind)
				),
				return: annotateConstructorKind(type.return, parameter, typeKind),
			};
		default:
			return type;
	}
};

const occurrenceCount = (type: Type, name: string): number => {
	switch (type.kind) {
		case 'variable':
			return Number(type.name === name);
		case 'variant':
			return type.args.reduce(
				(count, arg) => count + occurrenceCount(arg, name),
				0
			);
		case 'list':
			return occurrenceCount(type.element, name);
		case 'function':
			return [...type.params, type.return].reduce(
				(count, part) => count + occurrenceCount(part, name),
				0
			);
		case 'tuple':
			return type.elements.reduce(
				(count, part) => count + occurrenceCount(part, name),
				0
			);
		case 'record':
			return Object.values(type.fields).reduce(
				(count, part) => count + occurrenceCount(part, name),
				0
			);
		case 'union':
			return type.types.reduce(
				(count, part) => count + occurrenceCount(part, name),
				0
			);
		case 'constrained':
			return occurrenceCount(type.baseType, name);
		default:
			return 0;
	}
};

const nominalTemplate = (body: Type, registry: ADTRegistry) => {
	if (body.kind === 'list')
		return { name: 'List', arguments: [body.element], arity: 1 };
	if (body.kind !== 'variant') {
		throw new Error('A typefn body must be one saturated nominal constructor');
	}
	const declaration = registry.get(body.name);
	if (!declaration)
		throw new Error(`Unknown nominal constructor '${body.name}'`);
	return {
		name: body.name,
		arguments: body.args,
		arity: declaration.typeParams.length,
	};
};

export const compileConstructorAbstraction = (
	expression: TypeConstructorAbstractionExpression,
	expectedArity: number,
	registry: ADTRegistry
): TypeConstructorAbstraction => {
	if (expression.parameters.length !== expectedArity) {
		throw new Error(
			`typefn has ${expression.parameters.length} parameter(s), expected ${expectedArity}`
		);
	}
	if (new Set(expression.parameters).size !== expression.parameters.length) {
		throw new Error('typefn parameters must be unique');
	}
	const nominal = nominalTemplate(expression.body, registry);
	if (nominal.arguments.length !== nominal.arity) {
		throw new Error(
			`typefn body '${nominal.name}' must be saturated at arity ${nominal.arity}`
		);
	}
	for (const parameter of expression.parameters) {
		const direct = nominal.arguments.filter(
			argument => argument.kind === 'variable' && argument.name === parameter
		).length;
		if (direct !== 1 || occurrenceCount(expression.body, parameter) !== 1) {
			throw new Error(
				`typefn parameter '${parameter}' must occur exactly once as a direct constructor argument`
			);
		}
	}
	return {
		parameters: expression.parameters,
		body: expression.body,
		typeKind: arrowKind(expectedArity),
		nominalName: nominal.name,
	};
};

const instantiate = (type: Type, bindings: Map<string, Type>): Type => {
	switch (type.kind) {
		case 'variable':
			return bindings.get(type.name) ?? type;
		case 'variant':
			return {
				...type,
				args: type.args.map(arg => instantiate(arg, bindings)),
			};
		case 'list':
			return { ...type, element: instantiate(type.element, bindings) };
		case 'function':
			return {
				...type,
				params: type.params.map(arg => instantiate(arg, bindings)),
				return: instantiate(type.return, bindings),
			};
		case 'tuple':
			return {
				...type,
				elements: type.elements.map(arg => instantiate(arg, bindings)),
			};
		case 'record':
			return {
				...type,
				fields: Object.fromEntries(
					Object.entries(type.fields).map(([key, field]) => [
						key,
						instantiate(field, bindings),
					])
				),
			};
		case 'union':
			return {
				...type,
				types: type.types.map(arg => instantiate(arg, bindings)),
			};
		case 'constrained':
			return { ...type, baseType: instantiate(type.baseType, bindings) };
		default:
			return type;
	}
};

const sameType = (left: Type, right: Type): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

const matchTemplate = (
	template: Type,
	concrete: Type,
	parameters: Set<string>,
	bindings: Map<string, Type>
): boolean => {
	if (template.kind === 'variable') {
		if (parameters.has(template.name)) return true;
		const previous = bindings.get(template.name);
		if (!previous) {
			bindings.set(template.name, concrete);
			return true;
		}
		return sameType(previous, concrete);
	}
	if (template.kind !== concrete.kind) return false;
	if (template.kind === 'primitive' && concrete.kind === 'primitive')
		return template.name === concrete.name;
	if (template.kind === 'variant' && concrete.kind === 'variant') {
		return (
			template.name === concrete.name &&
			template.args.length === concrete.args.length &&
			template.args.every((arg, index) =>
				matchTemplate(arg, concrete.args[index], parameters, bindings)
			)
		);
	}
	if (template.kind === 'list' && concrete.kind === 'list') {
		return matchTemplate(
			template.element,
			concrete.element,
			parameters,
			bindings
		);
	}
	// Structural match, not equality: an inferred function type carries effect
	// and field detail a parsed typefn body lacks. Effects don't affect
	// dispatch and are not compared.
	if (template.kind === 'function' && concrete.kind === 'function') {
		return (
			template.params.length === concrete.params.length &&
			template.params.every((param, index) =>
				matchTemplate(param, concrete.params[index], parameters, bindings)
			) &&
			matchTemplate(template.return, concrete.return, parameters, bindings)
		);
	}
	if (template.kind === 'tuple' && concrete.kind === 'tuple') {
		return (
			template.elements.length === concrete.elements.length &&
			template.elements.every((element, index) =>
				matchTemplate(element, concrete.elements[index], parameters, bindings)
			)
		);
	}
	if (template.kind === 'record' && concrete.kind === 'record') {
		const templateKeys = Object.keys(template.fields);
		return (
			templateKeys.length === Object.keys(concrete.fields).length &&
			templateKeys.every(
				key =>
					key in concrete.fields &&
					matchTemplate(
						template.fields[key],
						concrete.fields[key],
						parameters,
						bindings
					)
			)
		);
	}
	return sameType(template, concrete);
};

export const matchConstructorAbstraction = (
	abstraction: TypeConstructorAbstraction,
	concrete: Type
): Map<string, Type> | null => {
	const templateArguments =
		abstraction.body.kind === 'list'
			? [abstraction.body.element]
			: abstraction.body.kind === 'variant'
				? abstraction.body.args
				: [];
	const concreteArguments =
		concrete.kind === 'list' && abstraction.nominalName === 'List'
			? [concrete.element]
			: concrete.kind === 'variant' && concrete.name === abstraction.nominalName
				? concrete.args
				: null;
	if (
		!concreteArguments ||
		concreteArguments.length !== templateArguments.length
	)
		return null;
	const bindings = new Map<string, Type>();
	const parameters = new Set(abstraction.parameters);
	return templateArguments.every((argument, index) =>
		matchTemplate(argument, concreteArguments[index], parameters, bindings)
	)
		? bindings
		: null;
};

export const betaReduce = (
	abstraction: TypeConstructorAbstraction,
	arguments_: Type[],
	bindings: Map<string, Type>
): Type => {
	if (arguments_.length !== abstraction.parameters.length) {
		throw new Error('typefn application arity mismatch');
	}
	const applied = new Map(bindings);
	abstraction.parameters.forEach((parameter, index) =>
		applied.set(parameter, arguments_[index])
	);
	return instantiate(abstraction.body, applied);
};

export const reduceConstructorValue = (type: Type, arguments_: Type[]): Type =>
	type.kind === 'constructor'
		? betaReduce(type.abstraction, arguments_, type.bindings)
		: type;
