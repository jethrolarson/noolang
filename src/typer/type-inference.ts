import * as fs from 'node:fs';
import * as path from 'node:path';
import { Lexer } from '../lexer/lexer';
import { parse } from '../parser/parser';
import {
	type Expression,
	type LiteralExpression,
	type VariableExpression,
	type FunctionExpression,
	type BinaryExpression,
	type IfExpression,
	type DefinitionExpression,
	type TupleDestructuringExpression,
	type RecordDestructuringExpression,
	type TupleDestructuringPattern,
	type RecordDestructuringPattern,
	type MutableDefinitionExpression,
	type MutationExpression,
	type ImportExpression,
	type RecordExpression,
	type AccessorExpression,
	type ListExpression,
	type TupleExpression,
	type WhereExpression,
	type TypedExpression,
	type ConstrainedExpression,
	type ConstraintExpr,
	type ConstraintDefinitionExpression,
	type ImplementDefinitionExpression,
	type UserDefinedTypeExpression,
	type Type,
	type FunctionType,
	type Constraint,
	type RecordDestructuringField,
	floatType,
	stringType,
	boolType,
	functionType,
	typeVariable,
	unknownType,
	unitType,
	listTypeWithElement,
	tupleType,
	recordType,
	variantType,
	ApplicationExpression,
	hasStructureConstraint,
	implementsConstraint,
	Pattern,
	DestructuringElement,
} from '../ast';
import {
	undefinedVariableError,
	nonFunctionApplicationError,
	traitFunctionShadowingError,
} from './type-errors';
import {
	getExprLocation,
	throwTypeError,
	mapSet,
	typeToString,
	propagateConstraintToTypeVariable,
} from './helpers';
import { unify } from './unify';
import { substitute } from './substitute';
import { typeExpression } from './expression-dispatcher';
import {
	tryResolveConstraints,
	extractFunctionConstraints,
} from './constraint-resolution';
import { isReservedTypeName } from './type-operations';
import { freeTypeVars } from './type-operations';

import {
	type TypeState,
	type TypeResult,
	createPureTypeResult,
	createTypeResult,
	unionEffects,
	emptyEffects,
	type TypeScheme,
} from './types';
import {
	freshTypeVariable,
	generalize,
	instantiate,
	freshenTypeVariables,
	flattenStatements,
} from './type-operations';
import { typeApplication } from './function-application';

import {
	isTraitFunction,
	getTraitFunctionInfo,
	addTraitDefinition,
	getTypeName,
	addTraitImplementation,
} from './trait-system';

export const typeLiteral = (
	expr: LiteralExpression,
	state: TypeState
): TypeResult => {
	const value = expr.value;

	if (typeof value === 'number') {
		// All numeric literals are Float (Int type has been removed)
		return createPureTypeResult(floatType(), state);
	} else if (typeof value === 'string') {
		return createPureTypeResult(stringType(), state);
	} else {
		return createPureTypeResult(unknownType(), state);
	}
};

export const typeVariableExpr = (
	expr: VariableExpression,
	state: TypeState
): TypeResult => {
	const scheme = state.environment.get(expr.name);
	if (!scheme) {
		if (isTraitFunction(state.traitRegistry, expr.name)) {
				const traitInfo = getTraitFunctionInfo(state.traitRegistry, expr.name);
			if (traitInfo) {
				const typeVars = new Set<string>();
				collectTypeVariables(traitInfo.functionType, typeVars);

				typeVars.add(traitInfo.typeParam);

				const scheme: TypeScheme = {
					quantifiedVars: Array.from(typeVars),
					type: traitInfo.functionType,
					effects: emptyEffects(),
				};

				const [freshenedType, state1] = instantiate(scheme, state);
				return createPureTypeResult(freshenedType, state1);
			}

			// Fallback: return a generic function type if trait info not found
			const [argType, state1] = freshTypeVariable(state);
			const [returnType, state2] = freshTypeVariable(state1);
			const traitFunctionType = functionType(
				[argType],
				returnType,
				emptyEffects()
			);
			return createPureTypeResult(traitFunctionType, state2);
		}

		throwTypeError(
			location => undefinedVariableError(expr.name, location),
			getExprLocation(expr)
		);
	}

	const [instantiatedType, newState] = instantiate(scheme, state);

	const effects = scheme.effects || emptyEffects();
	return createTypeResult(instantiatedType, effects, newState);
};

const countFunctionParams = (type: Type): number => {
	if (type.kind !== 'function') return 0;
	return type.params.length + countFunctionParams(type.return);
};

const flattenConstraintExpr = (expr: ConstraintExpr): Constraint[] => {
	switch (expr.kind) {
		case 'is':
			return [expr];
		case 'hasField':
		case 'implements':
		case 'custom':
		case 'has':
			return [expr];
		case 'and':
			return [
				...flattenConstraintExpr(expr.left),
				...flattenConstraintExpr(expr.right),
			];
		case 'or':
			return [
				...flattenConstraintExpr(expr.left),
				...flattenConstraintExpr(expr.right),
			];
		case 'paren':
			return flattenConstraintExpr(expr.expr);
		default:
			return [];
	}
};

const collectFreeVars = (
	expr: Expression,
	boundVars: Set<string> = new Set()
): Set<string> => {
	const freeVars = new Set<string>();

	const walk = (e: Expression, bound: Set<string>) => {
		switch (e.kind) {
			case 'variable':
				if (!bound.has(e.name)) {
					freeVars.add(e.name);
				}
				break;
			case 'function': {
				// Parameters are bound in the function body
				const newBound = new Set([...bound, ...e.params]);
				walk(e.body, newBound);
				break;
			}
			case 'definition': {
				// The defined name is bound for the value expression
				const defBound = new Set([...bound, e.name]);
				walk(e.value, defBound);
				break;
			}
			case 'application':
				walk(e.func, bound);
				e.args.forEach(arg => walk(arg, bound));
				break;
			case 'binary':
				walk(e.left, bound);
				walk(e.right, bound);
				// Operator is also a free variable
				if (!bound.has(e.operator)) {
					freeVars.add(e.operator);
				}
				break;
			case 'if':
				walk(e.condition, bound);
				walk(e.then, bound);
				walk(e.else, bound);
				break;
			case 'match':
				walk(e.expression, bound);
				e.cases.forEach(matchCase => {
					// Pattern variables are bound in the case body
					const patternVars = new Set<string>();
					// Extract pattern variables (simplified - should handle all pattern types)
					const extractPatternVars = (pattern: Pattern) => {
						if (pattern && pattern.kind === 'variable') {
							patternVars.add(pattern.name);
						}
						// Handle other pattern types as needed
					};
					extractPatternVars(matchCase.pattern);
					const caseBound = new Set([...bound, ...patternVars]);
					walk(matchCase.expression, caseBound);
				});
				break;
			case 'list':
				e.elements.forEach(element => walk(element, bound));
				break;
			case 'record':
				e.fields.forEach(field => walk(field.value, bound));
				break;
			case 'tuple':
				e.elements.forEach(element => walk(element, bound));
				break;
			case 'accessor':
				// Accessors don't have sub-expressions to walk
				break;
			case 'literal':
				// Literals don't have sub-expressions to walk
				break;
			case 'unit':
				// Unit expressions don't have sub-expressions to walk
				break;
			case 'pipeline':
				e.steps.forEach(step => walk(step, bound));
				break;
			case 'where':
				walk(e.main, bound);
				e.definitions.forEach(def => {
					if (def.kind === 'definition') {
						const defBound = new Set([...bound, def.name]);
						walk(def.value, defBound);
					} else if (def.kind === 'mutable-definition') {
						const defBound = new Set([...bound, def.name]);
						walk(def.value, defBound);
					}
				});
				break;
			case 'typed':
				walk(e.expression, bound);
				break;
			case 'constrained':
				walk(e.expression, bound);
				break;
			case 'mutable-definition': {
				const mutDefBound = new Set([...bound, e.name]);
				walk(e.value, mutDefBound);
				break;
			}
			case 'mutation':
				walk(e.value, bound);
				break;
			case 'import':
				// Import expressions don't have sub-expressions to walk
				break;
			case 'type-definition':
				// Type definitions don't have sub-expressions to walk
				break;
			case 'constraint-definition':
				// Constraint definitions don't have sub-expressions to walk
				break;
			case 'implement-definition':
				// Implement definitions don't have sub-expressions to walk
				break;
			case 'ffi':
				// FFI expressions don't have sub-expressions to walk
				break;
			default:
				// For any other types, recursively walk any sub-expressions
				// This is a fallback approach
				break;
		}
	};

	walk(expr, boundVars);
	return freeVars;
};

function createFunctionEnvironment(
	expr: FunctionExpression,
	state: TypeState
): Map<string, TypeScheme> {
	// Collect free variables used in the function body
	const boundParams = new Set(expr.params);
	const freeVars = collectFreeVars(expr.body, boundParams);

	// Create a minimal environment with only what's needed
	const functionEnv = new Map<string, TypeScheme>();

	// Always include built-ins and stdlib essentials
	const essentials = [
		'+',
		'-',
		'*',
		'/',
		'==',
		'!=',
		'<',
		'>',
		'<=',
		'>=',
		'|',
		'|>',
		'<|',
		';',
		'$',
		'if',
		'length',
		'head',
		'tail',
		'map',
		'filter',
		'reduce',
		'isEmpty',
		'append',
		'concat',
		'toString',
		'abs',
		'max',
		'min',
		'print',
		'println',
		'readFile',
		'writeFile',
		'log',
		'random',
		'randomRange',
		'mutSet',
		'mutGet',
		'hasKey',
		'hasValue',
		'set',
		'tupleLength',
		'tupleIsEmpty',
		'list_get',
		'True',
		'False',
		'None',
		'Some',
		'Ok',
		'Err',
		'Bool',
		'Option',
		'Result',
		'not',
	];

	for (const essential of essentials) {
		if (state.environment.has(essential)) {
			functionEnv.set(essential, state.environment.get(essential)!);
		}
	}

	// Include only the free variables actually used
	for (const freeVar of freeVars) {
		if (state.environment.has(freeVar)) {
			functionEnv.set(freeVar, state.environment.get(freeVar)!);
		}
	}

	return functionEnv;
}

function createParameterTypesAndTypeBody(
	expr: FunctionExpression,
	functionEnv: Map<string, TypeScheme>,
	state: TypeState
): { paramTypes: Type[]; bodyResult: TypeResult; currentState: TypeState } {
	let currentState = { ...state, environment: functionEnv };
	const paramTypes: Type[] = [];

	// Create parameter types
	for (const param of expr.params) {
		const [paramType, nextState] = freshTypeVariable(currentState);
		functionEnv.set(param, { type: paramType, quantifiedVars: [] });
		paramTypes.push(paramType);
		currentState = { ...nextState, environment: functionEnv };
	}

	// Type the function body with the function-local environment
	const bodyResult = typeExpression(expr.body, currentState);
	currentState = bodyResult.state;

	// Restore the original environment for the outer scope
	currentState = { ...currentState, environment: state.environment };

	return { paramTypes, bodyResult, currentState };
}

function handleConstrainedFunctionBody(
	expr: FunctionExpression,
	paramTypes: Type[],
	bodyResult: TypeResult,
	implicitConstraints: Constraint[]
): Type {
	const constrainedBody = expr.body;
	if (constrainedBody.kind !== 'constrained') {
		throw new Error(
			'handleConstrainedFunctionBody called with non-constrained body'
		);
	}

	const constraints = flattenConstraintExpr(constrainedBody.constraint);
	let funcType: Type;

	// If the constrained body has an explicit function type, use it as the innermost type
	if (constrainedBody.type.kind === 'function') {
		funcType = constrainedBody.type;

		// Apply constraints to this function type
		if (constraints.length > 0) {
			funcType.constraints = constraints;
			// Store the original constraint expression for display purposes
			funcType.originalConstraint = constrainedBody.constraint;

			// CRITICAL: Also propagate constraints to type variables in parameters
			// This ensures constraint validation works during function application
			for (const constraint of constraints) {
				if (constraint.kind === 'is') {
					propagateConstraintToTypeVariable(funcType, constraint);
				}
			}
		}

		// If we have more parameters than the explicit type accounts for, wrap it
		const explicitParamCount = countFunctionParams(constrainedBody.type);
		const actualParamCount = paramTypes.length;
		if (actualParamCount > explicitParamCount) {
			// Wrap the explicit function type with additional parameter layers
			for (let i = actualParamCount - explicitParamCount - 1; i >= 0; i--) {
				funcType = functionType([paramTypes[i]], funcType);
			}
		}
	} else {
		// Build function type normally and apply constraints
		funcType = bodyResult.type;
		for (let i = paramTypes.length - 1; i >= 0; i--) {
			funcType = functionType([paramTypes[i]], funcType);
		}
		const allConstraints = [...constraints, ...implicitConstraints];
		if (allConstraints.length > 0 && funcType.kind === 'function') {
			funcType.constraints = allConstraints;
		}
	}

	return funcType;
}

function buildNormalFunctionType(
	paramTypes: Type[],
	bodyResult: TypeResult,
	implicitConstraints: Constraint[]
): Type {
	// Extract constraints from the body result type if it's constrained
	const bodyConstraints: Constraint[] = [];
	let bodyType = bodyResult.type;

	if (bodyType.kind === 'constrained') {
		// Extract constraints from constrained body type
		for (const [typeVar, constraints] of bodyType.constraints.entries()) {
			for (const constraint of constraints) {
				if (constraint.kind === 'implements') {
					bodyConstraints.push({
						kind: 'implements',
						typeVar,
						interfaceName: constraint.interfaceName,
					});
				}
			}
		}
		// Use the base type for function construction
		bodyType = bodyType.baseType;
	}

	// Build the function type normally
	let funcType = bodyType;
	for (let i = paramTypes.length - 1; i >= 0; i--) {
		funcType = functionType([paramTypes[i]], funcType);
	}

	// Combine implicit constraints with body constraints
	const allConstraints = [...implicitConstraints, ...bodyConstraints];

	// Apply constraints if we have any
	if (allConstraints.length > 0 && funcType.kind === 'function') {
		// Only apply constraints if the function has type variables (is polymorphic)
		const hasTypeVariables = paramTypes.some(
			paramType => paramType.kind === 'variable'
		);

		if (hasTypeVariables) {
			// Attach constraints directly to the function type
			funcType.constraints = allConstraints;
		}
	}

	return funcType;
}

export const typeFunction = (
	expr: FunctionExpression,
	state: TypeState
): TypeResult => {
	const originalBody = expr.body;

	const functionEnv = createFunctionEnvironment(expr, state);
	const { paramTypes, bodyResult, currentState } =
		createParameterTypesAndTypeBody(expr, functionEnv, state);
	const implicitConstraints = collectImplicitConstraints(
		bodyResult.type,
		paramTypes,
		originalBody,
		expr.params
	);
	const substitutedParamTypes = paramTypes.map(t =>
		substitute(t, currentState.substitution)
	);
	const funcType =
		expr.body.kind === 'constrained'
			? handleConstrainedFunctionBody(
					expr,
					substitutedParamTypes,
					bodyResult,
					implicitConstraints
				)
			: buildNormalFunctionType(
					substitutedParamTypes,
					bodyResult,
					implicitConstraints
				);

	return createTypeResult(funcType, bodyResult.effects, currentState);
};

function collectImplicitConstraints(
	bodyType: Type,
	paramTypes: Type[],
	bodyExpr?: Expression,
	paramNames?: string[]
): Constraint[] {
	const constraints: Constraint[] = [];

	const allTypeVars = new Set<string>();
	for (const paramType of paramTypes) {
		collectTypeVariables(paramType, allTypeVars);
	}
	collectTypeVariables(bodyType, allTypeVars);

	// Collect trait constraints (existing functionality)
	if (bodyExpr && usesAddOperator(bodyExpr)) {
		const typeVarList = Array.from(allTypeVars).sort();
		if (typeVarList.length > 0) {
			const canonicalVar = typeVarList[0];
			constraints.push(implementsConstraint(canonicalVar, 'Add'));
		}
	}

	// DEPTH-FIRST: Generate structural constraints inline with unified variables
	if (bodyExpr && paramNames) {
		const structuralConstraints = generateDepthFirstConstraints(
			bodyExpr,
			paramNames,
			paramTypes
		);
		constraints.push(...structuralConstraints);
	}

	return constraints;
}

function usesOperator(expr: Expression, targetOperator: string): boolean {
	switch (expr.kind) {
		case 'binary':
			if (expr.operator === targetOperator) return true;
			return (
				usesOperator(expr.left, targetOperator) ||
				usesOperator(expr.right, targetOperator)
			);
		case 'application':
			return (
				usesOperator(expr.func, targetOperator) ||
				expr.args.some(arg => usesOperator(arg, targetOperator))
			);
		case 'function':
			return usesOperator(expr.body, targetOperator);
		case 'if':
			return (
				usesOperator(expr.condition, targetOperator) ||
				usesOperator(expr.then, targetOperator) ||
				usesOperator(expr.else, targetOperator)
			);
		case 'record':
			return expr.fields.some(field =>
				usesOperator(field.value, targetOperator)
			);
		case 'tuple':
			return expr.elements.some(element =>
				usesOperator(element, targetOperator)
			);
		case 'list':
			return expr.elements.some(element =>
				usesOperator(element, targetOperator)
			);
		case 'where':
			return (
				usesOperator(expr.main, targetOperator) ||
				expr.definitions.some(def => {
					if (def.kind === 'definition')
						return usesOperator(def.value, targetOperator);
					if (def.kind === 'tuple-destructuring')
						return usesOperator(def.value, targetOperator);
					if (def.kind === 'record-destructuring')
						return usesOperator(def.value, targetOperator);
					if (def.kind === 'mutable-definition')
						return usesOperator(def.value, targetOperator);
					return false;
				})
			);
		case 'match':
			return (
				usesOperator(expr.expression, targetOperator) ||
				expr.cases.some(case_ => usesOperator(case_.expression, targetOperator))
			);
		default:
			return false;
	}
}

const usesAddOperator = (expr: Expression): boolean => usesOperator(expr, '+');


function collectTypeVariables(type: Type, vars: Set<string>): void {
	switch (type.kind) {
		case 'variable':
			vars.add(type.name);
			break;
		case 'function':
			for (const param of type.params) {
				collectTypeVariables(param, vars);
			}
			collectTypeVariables(type.return, vars);
			break;
		case 'list':
			collectTypeVariables(type.element, vars);
			break;
		case 'variant':
			for (const arg of type.args) {
				collectTypeVariables(arg, vars);
			}
			break;
	}
}

export const typeDefinition = (
	expr: DefinitionExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Add placeholder for recursion before inferring the value
	const [placeholderType, newState] = freshTypeVariable(currentState);
	currentState = newState;

	const tempEnv = mapSet(currentState.environment, expr.name, {
		type: placeholderType,
		quantifiedVars: [],
	});
	currentState = { ...currentState, environment: tempEnv };

	// Type the value
	const valueResult = typeExpression(expr.value, currentState);
	currentState = valueResult.state;

	// Decorate the value with its inferred type
	expr.value.type = valueResult.type;

	// Unify placeholder with actual type for recursion
	currentState = unify(
		placeholderType,
		valueResult.type,
		currentState,
		getExprLocation(expr)
	);

	// Remove the just-defined variable from the environment for generalization
	const envForGen = new Map(currentState.environment);
	envForGen.delete(expr.name);

	// Generalize the type before storing in the environment
	let scheme: TypeScheme;

	if (expr.value.kind === 'typed') {
		// For explicit annotations: force quantification of all free variables to prevent sharing
		const annotationType = expr.value.type;
		const substitutedAnnotationType = substitute(
			annotationType,
			currentState.substitution
		);

		// Force quantification of all free variables in the annotation
		// This prevents type variable sharing between different polymorphic functions
		const allTypeVars = freeTypeVars(substitutedAnnotationType);

		scheme = {
			type: substitutedAnnotationType,
			quantifiedVars: Array.from(allTypeVars),
		};
	} else {
		// Normal generalization for non-annotated definitions
		scheme = generalize(valueResult.type, envForGen, currentState.substitution);
	}

	// Check if this variable would shadow a trait function
	const traitFunctions = currentState.traitRegistry.functionTraits.get(
		expr.name
	);
	if (traitFunctions && traitFunctions.length > 0) {
		throwTypeError(
			location =>
				traitFunctionShadowingError(expr.name, traitFunctions, location),
			getExprLocation(expr)
		);
	}

	// Add to environment with generalized type
	const finalEnv = mapSet(currentState.environment, expr.name, scheme);
	currentState = { ...currentState, environment: finalEnv };

	// Freshen type variables for the definition's value (thread state)
	const [finalType, finalState] = freshenTypeVariables(
		valueResult.type,
		new Map(),
		currentState
	);
	return createTypeResult(finalType, valueResult.effects, finalState);
};

export const typeIf = (expr: IfExpression, state: TypeState): TypeResult => {
	let currentState = state;

	// Type condition
	const conditionResult = typeExpression(expr.condition, currentState);
	currentState = conditionResult.state;

	// Unify condition with boolean
	currentState = unify(
		conditionResult.type,
		boolType(),
		currentState,
		getExprLocation(expr)
	);

	// Type then branch
	const thenResult = typeExpression(expr.then, currentState);
	currentState = thenResult.state;

	// Type else branch
	const elseResult = typeExpression(expr.else, currentState);
	currentState = elseResult.state;

	// Unify then and else types
	currentState = unify(
		thenResult.type,
		elseResult.type,
		currentState,
		getExprLocation(expr)
	);

	// Apply substitution to get final type
	const finalType = substitute(thenResult.type, currentState.substitution);

	return createTypeResult(
		finalType,
		unionEffects(
			conditionResult.effects,
			thenResult.effects,
			elseResult.effects
		),
		currentState
	);
};

const handleSequence = (
	expr: BinaryExpression,
	state: TypeState
): TypeResult => {
	const statements = flattenStatements(expr);
	let currentState = state,
		finalType = null,
		allEffects = emptyEffects();
	for (const stmt of statements) {
		const result = typeExpression(stmt, currentState);
		currentState = result.state;
		finalType = result.type;
		allEffects = unionEffects(allEffects, result.effects);
	}
	return createTypeResult(finalType || unitType(), allEffects, currentState);
};

const handleThrush = (
	expr: BinaryExpression,
	leftResult: TypeResult,
	rightResult: TypeResult,
	state: TypeState
): TypeResult => {
	if (
		rightResult.type.kind !== 'function' ||
		rightResult.type.params.length < 1
	)
		throwTypeError(
			location => nonFunctionApplicationError(rightResult.type, location),
			getExprLocation(expr)
		);
	const constraintContext = rightResult.type.constraints || [];
	const newState = unify(
		rightResult.type.params[0],
		leftResult.type,
		state,
		getExprLocation(expr),
		{ constraintContext }
	);
	return createTypeResult(
		rightResult.type.return,
		unionEffects(leftResult.effects, rightResult.effects),
		newState
	);
};

const handleDollar = (expr: BinaryExpression, state: TypeState): TypeResult => 
	typeApplication({ kind: 'application', func: expr.left, args: [expr.right], location: expr.location }, state);

const handleSafeThrush = (
	expr: BinaryExpression,
	leftResult: TypeResult,
	rightResult: TypeResult,
	state: TypeState
): TypeResult => {
	if (rightResult.type.kind !== 'function') {
		throwTypeError(
			location => nonFunctionApplicationError(rightResult.type, location),
			getExprLocation(expr)
		);
	}
	if (rightResult.type.params.length !== 1) {
		throw new Error(
			`Safe thrush operator requires function with exactly one parameter, got ${rightResult.type.params.length}`
		);
	}

	// Try constraint resolution first
	try {
		const syntheticApp: ApplicationExpression = {
			kind: 'application',
			func: { kind: 'variable', name: 'bind', location: expr.location },
			args: [expr.left, expr.right],
			location: expr.location,
		};
		return typeApplication(syntheticApp, state);
	} catch (error) {
		// Fall back to direct implementation for known monads
		if (
			leftResult.type.kind === 'variant' &&
			leftResult.type.args.length >= 1
		) {
			const monadName = leftResult.type.name;
			const innerType = leftResult.type.args[0];
			if (monadName === 'Option' || monadName === 'Result') {
				const currentState = unify(
					rightResult.type.params[0],
					innerType,
					state,
					getExprLocation(expr)
				);
				let resultType: Type;
				if (
					rightResult.type.return.kind === 'variant' &&
					rightResult.type.return.name === monadName
				) {
					resultType = rightResult.type.return;
				} else {
					if (monadName === 'Option') {
						resultType = variantType('Option', [rightResult.type.return]);
					} else if (
						monadName === 'Result' &&
						leftResult.type.args.length === 2
					) {
						resultType = variantType('Result', [
							rightResult.type.return,
							leftResult.type.args[1],
						]);
					} else {
						resultType = variantType(monadName, [rightResult.type.return]);
					}
				}
				return createTypeResult(
					resultType,
					unionEffects(leftResult.effects, rightResult.effects),
					currentState
				);
			}
		}
		throw error;
	}
};

export const typeBinary = (
	expr: BinaryExpression,
	state: TypeState
): TypeResult => {
	if (expr.operator === ';') return handleSequence(expr, state);

	let currentState = state;

	// Type left operand
	const leftResult = typeExpression(expr.left, currentState);
	currentState = leftResult.state;

	// Type right operand
	const rightResult = typeExpression(expr.right, currentState);
	currentState = rightResult.state;

	// Special operators
	if (expr.operator === '|')
		return handleThrush(expr, leftResult, rightResult, currentState);
	if (expr.operator === '$') return handleDollar(expr, currentState);

	if (expr.operator === '|?')
		return handleSafeThrush(expr, leftResult, rightResult, currentState);

	// Get operator type from environment
	const operatorScheme = currentState.environment.get(expr.operator);
	if (!operatorScheme) {
		throw new Error(`Unknown operator inferred: ${expr.operator}`);
	}

	const [operatorType, newState] = instantiate(operatorScheme, currentState);
	currentState = newState;

	// Create fresh type variable for result
	const [resultType, finalState] = freshTypeVariable(currentState);
	currentState = finalState;

	// Build expected function type
	const expectedType = functionType(
		[leftResult.type, rightResult.type],
		resultType
	);

	// Unify operator type with expected type
	currentState = unify(
		operatorType,
		expectedType,
		currentState,
		getExprLocation(expr),
		{
			reason: 'operator_application',
			operation: `applying operator ${expr.operator}`,
			hint: `The ${
				expr.operator
			} operator expects compatible operand types. Left operand: ${typeToString(
				leftResult.type,
				currentState.substitution
			)}, Right operand: ${typeToString(
				rightResult.type,
				currentState.substitution
			)}.`,
		}
	);

	// After unification, enforce operator trait constraints strictly (e.g., Numeric for -, *, /)
	const substitutedOperatorType = substitute(
		operatorType,
		currentState.substitution
	);
	if (substitutedOperatorType.kind === 'function') {
		const { functionConstraints } = extractFunctionConstraints(
			substitutedOperatorType
		);
		if (functionConstraints && functionConstraints.length > 0) {
			const substitutedArgTypes = [leftResult.type, rightResult.type].map(t =>
				substitute(t, currentState.substitution)
			);
			const constraintResult = tryResolveConstraints(
				resultType,
				functionConstraints,
				substitutedArgTypes,
				currentState
			);
			if (!constraintResult) {
				// If both operand types are fully concrete (no type variables), then fail hard
				const hasVars = substitutedArgTypes.some(t => freeTypeVars(t).size > 0);
				if (!hasVars) {
					throw new Error(
						`No implementation found for operator ${expr.operator} with operand types ${typeToString(
							substitutedArgTypes[0],
							currentState.substitution
						)} and ${typeToString(substitutedArgTypes[1], currentState.substitution)}`
					);
				}
				// Otherwise allow constraints to persist for later resolution (polymorphic context)
			} else {
				// Update state with any substitutions from constraint resolution
				currentState = constraintResult.updatedState;
			}
		}
	}

	// Apply substitution to get final result type
	const substitutedResultType = substitute(
		resultType,
		currentState.substitution
	);

	return createTypeResult(
		substitutedResultType,
		unionEffects(leftResult.effects, rightResult.effects),
		currentState
	);
};

// Type inference for user-defined types
export const typeUserDefinedType = (
	expr: UserDefinedTypeExpression,
	state: TypeState
): TypeResult => {
	const { name, typeParams, definition } = expr;

	// Disallow shadowing reserved built-in types
	if (isReservedTypeName(name)) {
		throw new Error(`Shadowing built in type ${name}`);
	}

	// If stdlib and builtins are loaded (protected set is non-empty), enforce global no-shadowing
	const strictShadowing =
		state.protectedTypeNames && state.protectedTypeNames.size > 0;
	if (strictShadowing) {
		if (state.protectedTypeNames.has(name)) {
			throw new Error(`Type shadowing is not allowed: ${name}`);
		}
		for (const existingName of state.environment.keys()) {
			if (
				existingName === name &&
				existingName[0] === existingName[0].toUpperCase()
			) {
				throw new Error(`Type shadowing is not allowed: ${name}`);
			}
		}
	}

	// If a type with the same name is already in the environment, error (duplicate definition)
	if (state.environment.has(name)) {
		throw new Error(`Type already defined: ${name}`);
	}

	// Create stable type variables for the user-defined type's parameters
	const typeVarMap = new Map<string, Type>();
	for (const param of typeParams) {
		typeVarMap.set(param, typeVariable(param));
	}

	// Create the user-defined type based on the definition
	let userType: Type;

	switch (definition.kind) {
		case 'record-type':
			// Convert to a standard record type
			userType = {
				kind: 'record',
				fields: definition.fields, // definition.fields is already { [key: string]: Type }
			};
			break;
		case 'tuple-type':
			// Convert to a standard tuple type
			userType = {
				kind: 'tuple',
				elements: definition.elements,
			};
			break;
		case 'union-type':
			// For single-type unions (type aliases), store the underlying type directly
			if (definition.types.length === 1) {
				userType = definition.types[0];
			} else {
				// Convert to a standard union type
				userType = {
					kind: 'union',
					types: definition.types,
				};
			}
			break;
	}

	// Add the user-defined type to the environment so it can be referenced by name
	const envWithType = new Map(state.environment);
	envWithType.set(name, {
		type: userType,
		quantifiedVars: typeParams,
	});

	const newState = { ...state, environment: envWithType };

	// Add this user-defined type name to protected set to prevent shadowing later
	const updatedProtected = new Set(newState.protectedTypeNames);
	updatedProtected.add(name);
	const finalState = { ...newState, protectedTypeNames: updatedProtected };

	return createPureTypeResult(unitType(), finalState);
};

// Type inference for mutable definitions
export const typeMutableDefinition = (
	expr: MutableDefinitionExpression,
	state: TypeState
): TypeResult => {
	// Handle mutable definitions similar to regular definitions
	const valueResult = typeExpression(expr.value, state);
	const newEnv = mapSet(state.environment, expr.name, {
		type: valueResult.type,
		quantifiedVars: [],
	});
	return createTypeResult(valueResult.type, valueResult.effects, {
		...valueResult.state,
		environment: newEnv,
	});
};

// Type inference for mutations
export const typeMutation = (
	expr: MutationExpression,
	state: TypeState
): TypeResult => {
	// For mutations, we need to check that the target exists and the value type matches
	const targetScheme = state.environment.get(expr.target);
	if (!targetScheme) {
		throwTypeError(
			location => undefinedVariableError(expr.target, location),
			getExprLocation(expr)
		);
	}

	const valueResult = typeExpression(expr.value, state);
	const newState = unify(
		targetScheme.type,
		valueResult.type,
		valueResult.state,
		getExprLocation(expr)
	);

	return createTypeResult(unitType(), valueResult.effects, newState); // Mutations return unit
};

// Type inference for imports
export const typeImport = (
	expr: ImportExpression,
	state: TypeState
): TypeResult => {
	try {
		const filePath = expr.path.endsWith('.noo')
			? expr.path
			: `${expr.path}.noo`;

		let fullPath: string;
		if (path.isAbsolute(filePath)) {
			fullPath = filePath;
		} else {
			// For type checking, we need to resolve relative to current working directory
			// In a real implementation, we'd want to track the current file being checked
			fullPath = path.resolve(filePath);
		}

		// Read and parse the imported file
		const content = fs.readFileSync(fullPath, 'utf8');
		const lexer = new Lexer(content);
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		// Type check the imported program - get the type of the final statement
		if (program.statements.length === 0) {
			// Empty program returns empty list type
			return createPureTypeResult(
				listTypeWithElement(typeVariable('a')),
				state
			);
		}

		// Process all statements and return the type of the final one
		let currentState = state;
		let finalType: Type = typeVariable('a');

		for (const statement of program.statements) {
			const result = typeExpression(statement, currentState);
			currentState = result.state;
			finalType = result.type;
		}

		// Return the type of the final statement
		return createPureTypeResult(finalType, currentState);
	} catch (_error) {
		// If import fails, we fall back to a type variable to avoid breaking the whole type check
		// This allows gradual typing and better error messages
		const [freshVar, newState] = freshTypeVariable(state);
		return createPureTypeResult(freshVar, newState);
	}
};

// Type inference for records
export const typeRecord = (
	expr: RecordExpression,
	state: TypeState
): TypeResult => {
	const fields: { [key: string]: Type } = {};
	let currentState = state;
	let allEffects = emptyEffects();

	for (const field of expr.fields) {
		const fieldResult = typeExpression(field.value, currentState);
		fields[field.name] = fieldResult.type;
		currentState = fieldResult.state;
		allEffects = unionEffects(allEffects, fieldResult.effects);
	}

	return createTypeResult(recordType(fields), allEffects, currentState);
};

// Type inference for accessors
export const typeAccessor = (
	expr: AccessorExpression,
	state: TypeState
): TypeResult => {
	// Check cache first
	const fieldName = expr.field;
	const cacheKey = expr.optional ? `${fieldName}?` : fieldName;
	const cachedType = state.accessorCache.get(cacheKey);
	if (cachedType) {
		return createPureTypeResult(cachedType, state);
	}

	// Accessors return functions that take any record with the required field and return the field type
	// @bar should have type {bar: a, ...} -> a (allows extra fields)
	// @bar? should have type {bar: a, ...} -> Option a
	// Use a fresh type variable for the field type
	const [fieldType, nextState] = freshTypeVariable(state);
	// Create a simple type variable for the record (no constraints on the variable itself)
	const [recordVar, finalState] = freshTypeVariable(nextState);

	// If optional, wrap return type in Option
	const returnType = expr.optional
		? variantType('Option', [fieldType])
		: fieldType;

	// Create a function type with constraints attached to both places
	const funcType = functionType([recordVar], returnType);
	// Add structural constraint only for non-optional accessors.
	// Optional accessors must NOT require the field to exist.
	if (!expr.optional && recordVar.kind === 'variable') {
		// For validation: add to the type variable itself
		recordVar.constraints = [
			hasStructureConstraint(recordVar.name, {
				fields: { [fieldName]: fieldType },
			}),
		];

		// For display: add to the function type
		funcType.constraints = [
			hasStructureConstraint(recordVar.name, {
				fields: { [fieldName]: fieldType },
			}),
		];
	}

	// Cache the result for future use (keyed by optional flag)
	const resultState = {
		...finalState,
		accessorCache: new Map(finalState.accessorCache).set(cacheKey, funcType),
	};

	return createPureTypeResult(funcType, resultState);
};

// Type inference for tuples
export const typeTuple = (
	expr: TupleExpression,
	state: TypeState
): TypeResult => {
	const elements: Type[] = [];
	let currentState = state;
	let allEffects = emptyEffects();

	for (const element of expr.elements) {
		const elementResult = typeExpression(element, currentState);
		elements.push(elementResult.type);
		currentState = elementResult.state;
		allEffects = unionEffects(allEffects, elementResult.effects);
	}

	return createTypeResult(tupleType(elements), allEffects, currentState);
};

// Type inference for lists
export const typeList = (
	expr: ListExpression,
	state: TypeState
): TypeResult => {
	if (expr.elements.length === 0) {
		// Empty list - we can't infer the element type
		return createPureTypeResult(listTypeWithElement(typeVariable('a')), state);
	}

	// Infer the type from the first element
	let currentState = state;
	const firstElementResult = typeExpression(expr.elements[0], currentState);
	currentState = firstElementResult.state;
	const firstElementType = firstElementResult.type;
	let allEffects = firstElementResult.effects;

	// Check that all elements have the same type
	for (let i = 1; i < expr.elements.length; i++) {
		const elementResult = typeExpression(expr.elements[i], currentState);
		currentState = elementResult.state;
		allEffects = unionEffects(allEffects, elementResult.effects);
		currentState = unify(firstElementType, elementResult.type, currentState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});
	}

	// Apply substitution to get the resolved element type
	const resolvedElementType = substitute(
		firstElementType,
		currentState.substitution
	);
	return createTypeResult(
		listTypeWithElement(resolvedElementType),
		allEffects,
		currentState
	);
};

// Type inference for where expressions
export const typeWhere = (
	expr: WhereExpression,
	state: TypeState
): TypeResult => {
	// Create a new type environment with the where-clause definitions
	let whereEnv = new Map(state.environment);
	let currentState = { ...state, environment: whereEnv };

	// Type all definitions in the where clause
	for (const def of expr.definitions) {
		if (def.kind === 'definition') {
			const definitionDef = def;
			const valueResult = typeExpression(definitionDef.value, currentState);
			currentState = valueResult.state;

			// Generalize with respect to the current whereEnv (excluding the new binding)
			const tempEnv = new Map(currentState.environment);
			tempEnv.delete(definitionDef.name);
			const scheme = generalize(
				valueResult.type,
				tempEnv,
				currentState.substitution
			);

			whereEnv = mapSet(currentState.environment, definitionDef.name, scheme);
			currentState = { ...currentState, environment: whereEnv };
		} else if (def.kind === 'mutable-definition') {
			const mutableDef = def;
			const valueResult = typeExpression(mutableDef.value, currentState);
			currentState = valueResult.state;

			whereEnv = mapSet(currentState.environment, mutableDef.name, {
				type: valueResult.type,
				quantifiedVars: [],
			});
			currentState = { ...currentState, environment: whereEnv };
		} else if (def.kind === 'tuple-destructuring') {
			const tupleResult = typeTupleDestructuring(def, currentState);
			currentState = tupleResult.state;
			whereEnv = currentState.environment;
		} else if (def.kind === 'record-destructuring') {
			const recordResult = typeRecordDestructuring(def, currentState);
			currentState = recordResult.state;
			whereEnv = currentState.environment;
		}
	}

	// Type the main expression
	const resultResult = typeExpression(expr.main, currentState);

	return createTypeResult(
		resultResult.type,
		resultResult.effects,
		resultResult.state
	);
};

// Type inference for typed expressions
// Helper function to resolve type aliases in type annotations
const resolveTypeAliases = (
	type: Type,
	state: TypeState,
	visited: Set<string> = new Set()
): Type => {
	switch (type.kind) {
		case 'variant': {
			// Prevent infinite recursion by tracking visited types
			if (visited.has(type.name)) {
				return type;
			}

			// Check if this variant name is actually a type alias
			const aliasScheme = state.environment.get(type.name);
			if (aliasScheme && aliasScheme.quantifiedVars.length === 0) {
				// This is a type alias with no parameters, resolve it
				visited.add(type.name);
				const resolved = resolveTypeAliases(aliasScheme.type, state, visited);
				visited.delete(type.name);
				return resolved;
			}
			// If it has arguments, recursively resolve them
			const resolvedArgs = type.args.map(arg =>
				resolveTypeAliases(arg, state, visited)
			);
			return { ...type, args: resolvedArgs };
		}
		case 'function':
			return {
				...type,
				params: type.params.map(param =>
					resolveTypeAliases(param, state, visited)
				),
				return: resolveTypeAliases(type.return, state, visited),
			};
		case 'list':
			return {
				...type,
				element: resolveTypeAliases(type.element, state, visited),
			};
		case 'tuple':
			return {
				...type,
				elements: type.elements.map(elem =>
					resolveTypeAliases(elem, state, visited)
				),
			};
		case 'record': {
			const resolvedFields: { [key: string]: Type } = {};
			for (const [key, fieldType] of Object.entries(type.fields)) {
				resolvedFields[key] = resolveTypeAliases(fieldType, state, visited);
			}
			return { ...type, fields: resolvedFields };
		}
		case 'union':
			return {
				...type,
				types: type.types.map(t => resolveTypeAliases(t, state, visited)),
			};
		default:
			return type;
	}
};

export const typeTyped = (
	expr: TypedExpression,
	state: TypeState
): TypeResult => {
	// For typed expressions, trust the explicit type annotation completely
	// This preserves the exact type annotation as written by the user

	// Infer the expression to get effects only
	const inferredResult = typeExpression(expr.expression, state);

	// Resolve any type aliases in the explicit type annotation
	const resolvedType = resolveTypeAliases(expr.type, inferredResult.state);

	// Verify that the inferred type is compatible with the annotation
	const currentState = unify(
		inferredResult.type,
		resolvedType,
		inferredResult.state,
		getExprLocation(expr)
	);

	// Return the resolved type (which preserves the annotation structure exactly)
	return createTypeResult(resolvedType, inferredResult.effects, currentState);
};

// Type inference for constrained expressions
export const typeConstrained = (
	expr: ConstrainedExpression,
	state: TypeState
): TypeResult => {
	// For constrained expressions, validate that the explicit type matches the inferred type
	const inferredResult = typeExpression(expr.expression, state);
	const explicitType = expr.type;

	const currentState = unify(
		inferredResult.type,
		explicitType,
		inferredResult.state,
		{
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		}
	);

	// Apply constraints to the explicit type
	const constraints = flattenConstraintExpr(expr.constraint);

	// Create a copy of the explicit type and apply constraints
	let resultType = explicitType;
	if (constraints.length > 0 && resultType.kind === 'function') {
		resultType = { ...resultType };
		resultType.constraints = constraints;
		resultType.originalConstraint = expr.constraint;
	}

	return createTypeResult(resultType, inferredResult.effects, currentState);
};

// Type constraint definition
export const typeConstraintDefinition = (
	expr: ConstraintDefinitionExpression,
	state: TypeState
): TypeResult => {
	const { name, typeParams, functions } = expr;

	// Create trait definition
	const functionMap = new Map<string, FunctionType>();

	for (const { type, name: funcName } of functions) {
		// Type the function signature, substituting the constraint type parameter
		if (type.kind == 'function') {
			functionMap.set(funcName, type);
		}
	}

	const traitDef = {
		name,
		typeParam: typeParams.length > 0 ? typeParams[0] : 'a', // Use first type param or default to 'a'
		functions: functionMap,
	};

	// Add to trait registry using the new trait system
	addTraitDefinition(state.traitRegistry, traitDef);

	// Constraint definitions have unit type
	return createPureTypeResult(unitType(), state);
};

// Type implement definition
export const typeImplementDefinition = (
	expr: ImplementDefinitionExpression,
	state: TypeState
): TypeResult => {
	const { constraintName, typeExpr, implementations, givenConstraints } = expr;

	// Extract type name from type expression - support all type kinds
	const typeName = getTypeName(typeExpr);

	// Check if trait exists in trait registry
	const traitDef = state.traitRegistry.definitions.get(constraintName);
	if (!traitDef) {
		throw new Error(`Trait '${constraintName}' not defined`);
	}

	// Type each implementation and store as expressions
	const implementationMap = new Map<string, Expression>();
	let currentState = state;
	let allEffects = emptyEffects();

	for (const impl of implementations) {
		// Check if function is required by trait
		const requiredType = traitDef.functions.get(impl.name);
		if (!requiredType) {
			throw new Error(
				`Function '${impl.name}' not required by trait '${constraintName}'`
			);
		}

		// Type the implementation to ensure it's valid
		const implResult = typeExpression(impl.value, currentState);
		currentState = implResult.state;
		allEffects = unionEffects(allEffects, implResult.effects);

		// TODO: Check that implementation type matches required type
		// For now, we'll trust the implementation

		// Store the expression (not the type scheme)
		implementationMap.set(impl.name, impl.value);
	}

	// Check that all required functions are implemented
	for (const [funcName] of traitDef.functions) {
		if (!implementationMap.has(funcName)) {
			throw new Error(
				`Missing implementation for '${funcName}' in implementation of '${constraintName}' for '${typeName}'`
			);
		}
	}

	// Create trait implementation
	const traitImpl = {
		typeName,
		functions: implementationMap,
		givenConstraints, // Include given constraints if present
	};

	// Add to trait registry using the new trait system
	addTraitImplementation(currentState.traitRegistry, constraintName, traitImpl);

	// Implement definitions have unit type
	return createTypeResult(unitType(), allEffects, currentState);
};

// Helper types for nested destructuring
type NestedTupleResult = {
	tupleType: Type;
	bindings: { name: string; type: Type }[];
};

type NestedRecordResult = {
	recordType: Type;
	bindings: { name: string; type: Type }[];
};

// Helper function to type nested tuple patterns
const typeNestedTuplePattern = (
	pattern: TupleDestructuringPattern,
	state: TypeState
): [NestedTupleResult, TypeState] => {
	let currentState = state;
	const elementTypes: Type[] = [];
	const bindings: { name: string; type: Type }[] = [];

	for (const element of pattern.elements) {
		if (element.kind === 'variable') {
			const [elementType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			elementTypes.push(elementType);
			bindings.push({ name: element.name, type: elementType });
		} else if (element.kind === 'nested-tuple') {
			const [nestedResult, newState] = typeNestedTuplePattern(
				element.pattern,
				currentState
			);
			currentState = newState;
			elementTypes.push(nestedResult.tupleType);
			bindings.push(...nestedResult.bindings);
		} else if (element.kind === 'nested-record') {
			const [nestedResult, newState] = typeNestedRecordPattern(
				element.pattern,
				currentState
			);
			currentState = newState;
			elementTypes.push(nestedResult.recordType);
			bindings.push(...nestedResult.bindings);
		} else {
			throw new Error(
				`Unknown destructuring element kind: ${(element as DestructuringElement).kind}`
			);
		}
	}

	return [{ tupleType: tupleType(elementTypes), bindings }, currentState];
};

// Helper function to type nested record patterns
const typeNestedRecordPattern = (
	pattern: RecordDestructuringPattern,
	state: TypeState
): [NestedRecordResult, TypeState] => {
	let currentState = state;
	const fieldTypes: { [key: string]: Type } = {};
	const bindings: { name: string; type: Type }[] = [];

	for (const field of pattern.fields) {
		if (field.kind === 'shorthand') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			bindings.push({ name: field.fieldName, type: fieldType });
		} else if (field.kind === 'rename') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			bindings.push({ name: field.localName, type: fieldType });
		} else if (field.kind === 'nested-tuple') {
			const [nestedResult, newState] = typeNestedTuplePattern(
				field.pattern,
				currentState
			);
			currentState = newState;
			fieldTypes[field.fieldName] = nestedResult.tupleType;
			bindings.push(...nestedResult.bindings);
		} else if (field.kind === 'nested-record') {
			const [nestedResult, newState] = typeNestedRecordPattern(
				field.pattern,
				currentState
			);
			currentState = newState;
			fieldTypes[field.fieldName] = nestedResult.recordType;
			bindings.push(...nestedResult.bindings);
		} else {
			throw new Error(
				`Unknown record destructuring field kind: ${(field as RecordDestructuringField).kind}`
			);
		}
	}

	return [{ recordType: recordType(fieldTypes), bindings }, currentState];
};

// Type inference for tuple destructuring
export const typeTupleDestructuring = (
	expr: TupleDestructuringExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Type the value first
	const valueResult = typeExpression(expr.value, currentState);
	currentState = valueResult.state;

	// Create fresh type variables for each destructured element
	const elementTypes: Type[] = [];
	const allBindings: { name: string; type: Type }[] = [];

	// Extract variable names and create types for them
	for (const element of expr.pattern.elements) {
		if (element.kind === 'variable') {
			const [elementType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			elementTypes.push(elementType);
			allBindings.push({ name: element.name, type: elementType });
		} else if (element.kind === 'nested-tuple') {
			// Handle nested tuple destructuring
			const [nestedResult, newState] = typeNestedTuplePattern(
				element.pattern,
				currentState
			);
			currentState = newState;
			elementTypes.push(nestedResult.tupleType);
			allBindings.push(...nestedResult.bindings);
		} else if (element.kind === 'nested-record') {
			// Handle nested record destructuring
			const [nestedResult, newState] = typeNestedRecordPattern(
				element.pattern,
				currentState
			);
			currentState = newState;
			elementTypes.push(nestedResult.recordType);
			allBindings.push(...nestedResult.bindings);
		} else {
			throw new Error(
				`Unknown destructuring element kind: ${(element as DestructuringElement).kind}`
			);
		}
	}

	// Create tuple type and unify with value
	const expectedTupleType = tupleType(elementTypes);
	currentState = unify(
		valueResult.type,
		expectedTupleType,
		currentState,
		getExprLocation(expr)
	);

	// Add all destructured variables to environment
	for (const binding of allBindings) {
		const scheme = generalize(
			binding.type,
			currentState.environment,
			currentState.substitution
		);
		const finalEnv = mapSet(currentState.environment, binding.name, scheme);
		currentState = { ...currentState, environment: finalEnv };
	}

	// Return the tuple type and effects
	return createTypeResult(expectedTupleType, valueResult.effects, currentState);
};

// Type inference for record destructuring
export const typeRecordDestructuring = (
	expr: RecordDestructuringExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Type the value first
	const valueResult = typeExpression(expr.value, currentState);
	currentState = valueResult.state;

	// Create fresh type variables for each destructured field and collect bindings
	const fieldTypes: { [key: string]: Type } = {};
	const localBindings: { localName: string; fieldName: string; type: Type }[] =
		[];

	// Extract field information and create types
	for (const field of expr.pattern.fields) {
		if (field.kind === 'shorthand') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			localBindings.push({
				localName: field.fieldName, // shorthand: @name -> name
				fieldName: field.fieldName,
				type: fieldType,
			});
		} else if (field.kind === 'rename') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			localBindings.push({
				localName: field.localName, // rename: @name userName -> userName
				fieldName: field.fieldName,
				type: fieldType,
			});
		} else if (field.kind === 'nested-tuple') {
			const [nestedResult, newState] = typeNestedTuplePattern(
				field.pattern,
				currentState
			);
			currentState = newState;
			fieldTypes[field.fieldName] = nestedResult.tupleType;
			// Add all nested bindings
			for (const binding of nestedResult.bindings) {
				localBindings.push({
					localName: binding.name,
					fieldName: field.fieldName,
					type: binding.type,
				});
			}
		} else if (field.kind === 'nested-record') {
			const [nestedResult, newState] = typeNestedRecordPattern(
				field.pattern,
				currentState
			);
			currentState = newState;
			fieldTypes[field.fieldName] = nestedResult.recordType;
			// Add all nested bindings
			for (const binding of nestedResult.bindings) {
				localBindings.push({
					localName: binding.name,
					fieldName: field.fieldName,
					type: binding.type,
				});
			}
		} else {
			throw new Error(
				`Unknown record destructuring field kind: ${(field as RecordDestructuringPattern).kind}`
			);
		}
	}

	// Create record type and unify with value
	const expectedRecordType = recordType(fieldTypes);
	currentState = unify(
		valueResult.type,
		expectedRecordType,
		currentState,
		getExprLocation(expr)
	);

	// Add all destructured variables to environment
	for (const binding of localBindings) {
		const scheme = generalize(
			binding.type,
			currentState.environment,
			currentState.substitution
		);
		const finalEnv = mapSet(
			currentState.environment,
			binding.localName,
			scheme
		);
		currentState = { ...currentState, environment: finalEnv };
	}

	// Return the record type and effects
	return createTypeResult(
		expectedRecordType,
		valueResult.effects,
		currentState
	);
};

// DEPTH-FIRST constraint generation - replaces collectAccessorConstraints
function generateDepthFirstConstraints(
	expr: Expression,
	paramNames: string[],
	paramTypes: Type[]
): Constraint[] {
	const constraints: Constraint[] = [];

	// Create mapping from parameter names to their type variables
	const paramTypeVars = new Map<string, string>();
	for (let i = 0; i < paramNames.length && i < paramTypes.length; i++) {
		const paramType = paramTypes[i];
		if (paramType.kind === 'variable') {
			paramTypeVars.set(paramNames[i], paramType.name);
		}
	}

	// Analyze expression for accessor composition patterns
	function analyzeExpression(e: Expression): void {
		if (!e) return;

		if (
			e.kind === 'application' &&
			e.func.kind === 'accessor' &&
			e.args.length === 1
		) {
			const outerField = e.func.field;
			const innerArg = e.args[0];

			// Check for composition: @outer (@inner param)
			if (
				innerArg.kind === 'application' &&
				innerArg.func.kind === 'accessor' &&
				innerArg.args.length === 1 &&
				innerArg.args[0].kind === 'variable' &&
				paramTypeVars.has(innerArg.args[0].name)
			) {
				const innerField = innerArg.func.field;
				const paramName = innerArg.args[0].name;
				const paramTypeVar = paramTypeVars.get(paramName)!;

				// Generate multiplicative constraint directly
				const resultVar = `α${Math.random().toString(36).substr(2, 9)}`;
				const composedConstraint = hasStructureConstraint(paramTypeVar, {
					fields: {
						[innerField]: {
							kind: 'nested',
							structure: {
								fields: {
									[outerField]: { kind: 'variable', name: resultVar },
								},
							},
						},
					},
				});

				constraints.push(composedConstraint);
				return; // Don't recurse - we handled the composition
			}
		}

		// Recurse into sub-expressions for other cases
		if (e.kind === 'application') {
			analyzeExpression(e.func);
			e.args.forEach(analyzeExpression);
		} else if (e.kind === 'binary') {
			analyzeExpression(e.left);
			analyzeExpression(e.right);
		}
		// Add other cases as needed
	}

	analyzeExpression(expr);
	return constraints;
}
