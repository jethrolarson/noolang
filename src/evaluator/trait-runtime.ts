import type { Expression, VariableExpression } from '../ast';
import type { TraitRegistry } from '../typer/trait-system';
import {
	boolValue,
	compareStructuralValues,
	createBool,
	isBool,
	isConstructor,
	isFunction,
	isList,
	isNativeFunction,
	isNumber,
	isRecord,
	isString,
	isTuple,
	isUnit,
	type TraitFunctionValue,
	type Value,
} from './evaluator-utils';

export type TraitRuntimeContext = {
	traitRegistry: TraitRegistry;
	evaluateExpression: (expression: Expression) => Value;
	variantNameForConstructor: (constructorName: string) => string | undefined;
};

type TraitValueSelection = NonNullable<
	VariableExpression['traitValueSelection']
>;

export const isTraitFunction = (
	context: TraitRuntimeContext,
	functionName: string
): boolean => {
	for (const traitDefinition of context.traitRegistry.definitions.values()) {
		if (traitDefinition.functions.has(functionName)) return true;
	}
	return false;
};

export const resolveTraitValue = (
	context: TraitRuntimeContext,
	valueName: string,
	selection: TraitValueSelection
): Value => {
	const { traitName, typeName } = selection;
	const implementation = context.traitRegistry.implementations
		.get(traitName)
		?.get(typeName);
	if (!implementation?.values?.has(valueName)) {
		throw new Error(
			`Missing selected associated value ${traitName}.${valueName} for ${typeName}`
		);
	}

	const captured = implementation.evaluatedValues?.get(valueName);
	if (captured !== undefined) return captured as Value;

	const valueExpression = implementation.values.get(valueName);
	if (!valueExpression) {
		throw new Error(
			`Missing selected associated value ${traitName}.${valueName} for ${typeName}`
		);
	}
	const evaluated = context.evaluateExpression(valueExpression);
	if (!implementation.evaluatedValues) {
		implementation.evaluatedValues = new Map();
	}
	implementation.evaluatedValues.set(valueName, evaluated);
	return evaluated;
};

const getValueTypeName = (
	context: TraitRuntimeContext,
	value: Value
): string => {
	if (isNumber(value)) return 'Float';
	if (isString(value)) return 'String';
	if (isBool(value)) return 'Bool';
	if (isList(value)) return 'List';
	if (isRecord(value)) return 'Record';
	if (isTuple(value)) return 'Tuple';
	if (isConstructor(value)) {
		return context.variantNameForConstructor(value.name) ?? value.name;
	}
	return 'Unknown';
};

const applyRegisteredTraitFunction = (
	context: TraitRuntimeContext,
	functionName: string,
	argValues: Value[],
	traitRegistry: TraitRegistry,
	dispatchValue = argValues[0]
): Value | null => {
	const dispatchTypeName = getValueTypeName(context, dispatchValue);
	for (const [traitName, traitDefinition] of traitRegistry.definitions) {
		if (!traitDefinition.functions.has(functionName)) continue;
		const implementation = traitRegistry.implementations
			.get(traitName)
			?.get(dispatchTypeName);
		const hasEvaluated = implementation?.evaluatedFunctions?.has(functionName);
		const hasAst = implementation?.functions.has(functionName);
		if (!implementation || (!hasEvaluated && !hasAst)) continue;

		let result = hasEvaluated
			? (implementation.evaluatedFunctions!.get(functionName) as Value)
			: context.evaluateExpression(implementation.functions.get(functionName)!);
		for (const argument of argValues) {
			if (isFunction(result) || isNativeFunction(result)) {
				result = result.fn(argument);
			} else {
				throw new Error(
					'Cannot apply argument to non-function during trait resolution'
				);
			}
		}
		return result;
	}
	return null;
};

export const evaluateEquality = (
	context: TraitRuntimeContext,
	left: Value,
	right: Value,
	traitRegistry: TraitRegistry
): Value => {
	if (isNumber(left) && isNumber(right)) {
		return createBool(left.value === right.value);
	}
	if (isString(left) && isString(right)) {
		return createBool(left.value === right.value);
	}
	if (isUnit(left) && isUnit(right)) return createBool(true);

	const registered = applyRegisteredTraitFunction(
		context,
		'equals',
		[left, right],
		traitRegistry
	);
	if (registered) return registered;

	const structural = compareStructuralValues(
		left,
		right,
		(a, b) => boolValue(evaluateEquality(context, a, b, traitRegistry)),
		value => context.variantNameForConstructor(value.name) !== undefined
	);
	if (structural !== null) return createBool(structural);
	throw new Error(
		`Cannot compare ${left?.tag || 'unit'} and ${right?.tag || 'unit'} for equality`
	);
};

export const resolveTraitFunctionWithArgs = (
	context: TraitRuntimeContext,
	functionName: string,
	argValues: Value[],
	traitRegistry: TraitRegistry
): Value => {
	const argTypeNames = argValues.map(value => getValueTypeName(context, value));
	const possibleDispatchIndices =
		argTypeNames.length > 1 ? [argTypeNames.length - 1, 0] : [0];

	for (const dispatchIndex of possibleDispatchIndices) {
		const result = applyRegisteredTraitFunction(
			context,
			functionName,
			argValues,
			traitRegistry,
			argValues[dispatchIndex]
		);
		if (result) return result;
	}

	if (functionName === 'equals' && argValues.length >= 2) {
		return evaluateEquality(context, argValues[0], argValues[1], traitRegistry);
	}

	if (
		argTypeNames.every(typeName => typeName === 'Unknown') ||
		argTypeNames.length < 2
	) {
		return {
			tag: 'trait-function',
			name: functionName,
			traitRegistry,
			partialArgs: argValues,
		};
	}

	const knownTypes = argTypeNames.filter(typeName => typeName !== 'Unknown');
	const typeNames = knownTypes.length > 0 ? knownTypes.join(', ') : 'Unknown';
	throw new Error(
		`No implementation of trait function ${functionName} for ${typeNames}`
	);
};

export const evaluateTraitFunctionApplication = (
	context: TraitRuntimeContext,
	traitFunction: TraitFunctionValue,
	argExpressions: Expression[]
): Value => {
	const argValues = argExpressions.map(context.evaluateExpression);
	const allArgs = traitFunction.partialArgs
		? [...traitFunction.partialArgs, ...argValues]
		: argValues;
	return resolveTraitFunctionWithArgs(
		context,
		traitFunction.name,
		allArgs,
		traitFunction.traitRegistry
	);
};

export const applyTraitFunctionWithValues = (
	context: TraitRuntimeContext,
	traitFunction: TraitFunctionValue,
	argValues: Value[]
): Value => {
	const allArgs = traitFunction.partialArgs
		? [...traitFunction.partialArgs, ...argValues]
		: argValues;
	return resolveTraitFunctionWithArgs(
		context,
		traitFunction.name,
		allArgs,
		traitFunction.traitRegistry
	);
};
