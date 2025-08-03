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
	type Type,
	type FunctionType,
	type Constraint,
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
	type VariableType,
	Pattern,
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
	createConstrainedType,
} from './type-operations';
import { typeApplication } from './function-application';

import {
	isTraitFunction,
	getTraitFunctionInfo,
	addTraitDefinition,
	getTypeName,
	addTraitImplementation,
} from './trait-system';

import { isSimpleFieldConstraint } from './constraint-composition';

// Note: Main typeExpression is now in expression-dispatcher.ts
// This file only contains the individual type inference functions

// Type inference for literals
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

// Type inference for variables
export const typeVariableExpr = (
	expr: VariableExpression,
	state: TypeState
): TypeResult => {
	const scheme = state.environment.get(expr.name);
	if (!scheme) {
		// NEW: Check if this is a trait function before throwing error
		if (isTraitFunction(state.traitRegistry, expr.name)) {
			// Get the trait function's type and constraint information
			const traitInfo = getTraitFunctionInfo(state.traitRegistry, expr.name);
			if (traitInfo) {
				// Use standard type scheme instantiation instead of manual freshening
				// First, collect all type variables from the trait function type
				const typeVars = new Set<string>();
				collectTypeVariables(traitInfo.functionType, typeVars);
				
				// Add the trait type parameter if not already collected
				typeVars.add(traitInfo.typeParam);
				
				// Create a type scheme and instantiate it properly
				const scheme: TypeScheme = {
					quantifiedVars: Array.from(typeVars),
					type: traitInfo.functionType,
					effects: emptyEffects()
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

	// Handle effects from TypeScheme
	const effects = scheme.effects || emptyEffects();
	return createTypeResult(instantiatedType, effects, newState);
};

// Helper function to count parameters in a function type
const countFunctionParams = (type: Type): number => {
	if (type.kind !== 'function') return 0;
	return type.params.length + countFunctionParams(type.return);
};

// Flatten a constraint expression into a list of atomic constraints
const flattenConstraintExpr = (expr: ConstraintExpr): Constraint[] => {
	switch (expr.kind) {
		case 'is':
			// NOTE: Constraint name validation removed
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

// Collect free variables used in an expression
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

// Helper: Create function environment with closure culling
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

// Helper: Create parameter types and type function body
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

// Helper: Handle constrained function bodies
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

// Helper: Build normal function type
function buildNormalFunctionType(
	paramTypes: Type[],
	bodyResult: TypeResult,
	implicitConstraints: Constraint[]
): Type {
	// Build the function type normally
	let funcType = bodyResult.type;
	for (let i = paramTypes.length - 1; i >= 0; i--) {
		funcType = functionType([paramTypes[i]], funcType);
	}

	// Apply implicit constraints even when there are no explicit constraints
	if (implicitConstraints.length > 0 && funcType.kind === 'function') {
		// Only apply constraints if the function has type variables (is polymorphic)
		const hasTypeVariables = paramTypes.some(
			paramType => paramType.kind === 'variable'
		);

		if (hasTypeVariables) {
			// Attach constraints directly to the function type
			funcType.constraints = implicitConstraints;
		}
	}

	return funcType;
}

// Main function type inference (now much more focused)
export const typeFunction = (
	expr: FunctionExpression,
	state: TypeState
): TypeResult => {
	const originalBody = expr.body;

	// 1. Create function environment with closure culling
	const functionEnv = createFunctionEnvironment(expr, state);

	// 2. Create parameter types and type the body
	const { paramTypes, bodyResult, currentState } =
		createParameterTypesAndTypeBody(expr, functionEnv, state);

	// 3. Collect implicit constraints from the original function body
	const implicitConstraints = collectImplicitConstraints(
		bodyResult.type,
		paramTypes,
		currentState,
		originalBody,
		expr.params
	);

	// 4. Build function type based on whether body is constrained
	const funcType =
		expr.body.kind === 'constrained'
			? handleConstrainedFunctionBody(
					expr,
					paramTypes,
					bodyResult,
					implicitConstraints
				)
			: buildNormalFunctionType(paramTypes, bodyResult, implicitConstraints);

	return createTypeResult(funcType, bodyResult.effects, currentState);
};

// Helper function to collect implicit constraints from function bodies
function collectImplicitConstraints(
	bodyType: Type,
	paramTypes: Type[],
	state: TypeState,
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

// Helper function to check if an expression uses a specific operator
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

// Helper function to check if an expression uses the + operator (for backward compatibility)
function usesAddOperator(expr: Expression): boolean {
	return usesOperator(expr, '+');
}

// Helper function to collect structural constraints from accessor expressions in function bodies
function collectAccessorConstraints(
	expr: Expression,
	paramNames: string[],
	paramTypes: Type[],
	state: TypeState
): Constraint[] {
	const constraints: Constraint[] = [];

	// Create a mapping from parameter names to their type variables
	const paramTypeVars = new Map<string, string>();
	for (let i = 0; i < paramNames.length && i < paramTypes.length; i++) {
		const paramType = paramTypes[i];
		if (paramType.kind === 'variable') {
			paramTypeVars.set(paramNames[i], paramType.name);
		}
	}

	// Helper function to check if a type is an accessor type
	function isAccessorType(type: Type): boolean {
		return (
			type.kind === 'function' &&
			!!type.constraints &&
			type.constraints.some((c: Constraint) => c.kind === 'has')
		);
	}

	// Helper function to extract field name from accessor constraint
	function getAccessorField(constraint: Constraint): string | null {
		if (
			constraint.kind === 'has' &&
			constraint.structure &&
			constraint.structure.fields
		) {
			const fieldNames = Object.keys(constraint.structure.fields);
			return fieldNames.length === 1 ? fieldNames[0] : null;
		}
		return null;
	}

	// Recursively collect accessor constraints from the expression
	function collectFromExpression(e: Expression): void {
		if (!e) return;

		switch (e.kind) {
			case 'application': {
				const func = e.func;
				const args = e.args;

				// Case 1: Direct accessor applications like "@name obj"
				if (func.kind === 'accessor' && args.length === 1) {
					const accessorField = func.field;
					const arg = args[0];

					// Check if the argument is one of our parameters
					if (arg.kind === 'variable' && paramTypeVars.has(arg.name)) {
						const paramTypeVar = paramTypeVars.get(arg.name)!;

						// Create a fresh type variable for the field type
						const fieldTypeVar = `α${Math.random().toString(36).substr(2, 9)}`;

						// Create the structural constraint: paramTypeVar has {accessorField: fieldTypeVar}
						constraints.push(
							hasStructureConstraint(paramTypeVar, {
								fields: {
									[accessorField]: { kind: 'variable', name: fieldTypeVar },
								},
							})
						);
					}
				}

				// Case 2: Variable references that are accessors (like "getAddress obj")
				if (func.kind === 'variable' && args.length === 1) {
					const varName = func.name;
					const arg = args[0];

					// Check if the argument is one of our parameters
					if (arg.kind === 'variable' && paramTypeVars.has(arg.name)) {
						const paramTypeVar = paramTypeVars.get(arg.name)!;

						// Check if the variable is an accessor by looking it up in the environment
						const scheme = state.environment.get(varName);
						if (scheme) {
							// Apply substitution to get the actual type
							const actualType = substitute(scheme.type, state.substitution);

							if (isAccessorType(actualType)) {
								// Extract the field name from the accessor's constraints
								const accessorConstraint = (
									actualType as FunctionType
								).constraints?.find((c: Constraint) => c.kind === 'has');
								if (accessorConstraint) {
									const fieldName = getAccessorField(accessorConstraint);
									if (fieldName) {
										// Create a fresh type variable for the field type
										const fieldTypeVar = `α${Math.random().toString(36).substr(2, 9)}`;

										// Create the structural constraint: paramTypeVar has {fieldName: fieldTypeVar}
										constraints.push(
											hasStructureConstraint(paramTypeVar, {
												fields: {
													[fieldName]: { kind: 'variable', name: fieldTypeVar },
												},
											})
										);
									}
								}
							}
						}
					}
				}

				// Case 3: Composed accessor patterns like "getStreet (getAddress person)"
				if (
					func.kind === 'variable' &&
					args.length === 1 &&
					args[0].kind === 'application'
				) {
					const outerAccessorName = func.name;
					const innerApplication = args[0];

					// Check if inner application is also an accessor
					if (
						innerApplication.func.kind === 'variable' &&
						innerApplication.args.length === 1 &&
						innerApplication.args[0].kind === 'variable' &&
						paramTypeVars.has(innerApplication.args[0].name)
					) {
						const innerAccessorName = innerApplication.func.name;
						const paramName = innerApplication.args[0].name;
						const paramTypeVar = paramTypeVars.get(paramName)!;

						// Get both accessor types from environment
						const outerScheme = state.environment.get(outerAccessorName);
						const innerScheme = state.environment.get(innerAccessorName);

						if (outerScheme && innerScheme) {
							const outerType = substitute(
								outerScheme.type,
								state.substitution
							);
							const innerType = substitute(
								innerScheme.type,
								state.substitution
							);

							// Check if both are accessor types with simple constraints
							if (isAccessorType(outerType) && isAccessorType(innerType)) {
								const outerConstraint = (
									outerType as FunctionType
								).constraints?.find((c: Constraint) => c.kind === 'has');
								const innerConstraint = (
									innerType as FunctionType
								).constraints?.find((c: Constraint) => c.kind === 'has');

								if (
									outerConstraint &&
									innerConstraint &&
									outerConstraint.kind === 'has' &&
									innerConstraint.kind === 'has' &&
									isSimpleFieldConstraint(outerConstraint) &&
									isSimpleFieldConstraint(innerConstraint)
								) {
									// Extract field names
									const outerField = getAccessorField(outerConstraint);
									const innerField = getAccessorField(innerConstraint);

									if (outerField && innerField) {
										// Create constraint variables for composition
										const intermediateVar = `α${Math.random().toString(36).substr(2, 9)}`;
										const finalVar = `α${Math.random().toString(36).substr(2, 9)}`;

										// Create the inner constraint: paramTypeVar has {innerField: intermediateVar}
										const innerComposedConstraint = hasStructureConstraint(
											paramTypeVar,
											{
												fields: {
													[innerField]: {
														kind: 'variable',
														name: intermediateVar,
													},
												},
											}
										);

										// Create the outer constraint: intermediateVar has {outerField: finalVar}
										const outerComposedConstraint = hasStructureConstraint(
											intermediateVar,
											{
												fields: {
													[outerField]: { kind: 'variable', name: finalVar },
												},
											}
										);

										// For composed accessor patterns, use separate constraints that can be resolved by existing logic
										// This creates the logical relationship between constraints while working with the current resolution system
										constraints.push(innerComposedConstraint);
										constraints.push(outerComposedConstraint);
									}
								}
							}
						}
					}
				}

				// Recursively check function and arguments
				collectFromExpression(func);
				args.forEach(collectFromExpression);
				break;
			}

			case 'function':
				collectFromExpression(e.body);
				break;

			case 'binary':
				collectFromExpression(e.left);
				collectFromExpression(e.right);
				break;

			case 'if':
				collectFromExpression(e.condition);
				collectFromExpression(e.then);
				collectFromExpression(e.else);
				break;

			case 'record':
				e.fields.forEach(field => collectFromExpression(field.value));
				break;

			case 'tuple':
				e.elements.forEach(collectFromExpression);
				break;

			case 'list':
				e.elements.forEach(collectFromExpression);
				break;

			case 'where':
				collectFromExpression(e.main);
				e.definitions.forEach(def => {
					if (def.kind === 'definition') {
						collectFromExpression(def.value);
					} else if (def.kind === 'tuple-destructuring') {
						collectFromExpression(def.value);
					} else if (def.kind === 'record-destructuring') {
						collectFromExpression(def.value);
					} else if (def.kind === 'mutable-definition') {
						collectFromExpression(def.value);
					}
				});
				break;

			case 'match':
				collectFromExpression(e.expression);
				e.cases.forEach(case_ => collectFromExpression(case_.expression));
				break;

			default:
				// No nested expressions to check
				break;
		}
	}

	collectFromExpression(expr);
	return constraints;
}

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

// Type inference for definitions
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

	// Generalize the type before storing in the environment (apply substitution!)
	const scheme = generalize(
		valueResult.type,
		envForGen,
		currentState.substitution
	);

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

// Type inference for if expressions
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

// Type inference for binary expressions
export const typeBinary = (
	expr: BinaryExpression,
	state: TypeState
): TypeResult => {
	// Special handling for semicolon operator (sequence) - flatten to avoid O(n²) re-evaluation
	if (expr.operator === ';') {
		// Flatten the semicolon sequence and process each statement exactly once
		const statements = flattenStatements(expr);
		let currentState = state;
		let finalType = null;
		let allEffects = emptyEffects();

		for (const statement of statements) {
			const result = typeExpression(statement, currentState);
			currentState = result.state;
			finalType = result.type;
			allEffects = unionEffects(allEffects, result.effects);
		}

		return createTypeResult(finalType || unitType(), allEffects, currentState);
	}

	let currentState = state;

	// Type left operand
	const leftResult = typeExpression(expr.left, currentState);
	currentState = leftResult.state;

	// Type right operand
	const rightResult = typeExpression(expr.right, currentState);
	currentState = rightResult.state;

	// Special handling for thrush operator (|) - function application
	if (expr.operator === '|') {
		// Thrush: a | b means b(a) - apply right function to left value
		if (rightResult.type.kind !== 'function') {
			throwTypeError(
				location => nonFunctionApplicationError(rightResult.type, location),
				getExprLocation(expr)
			);
		}

		// Check that the function can take the left value as its first argument
		if (rightResult.type.params.length < 1) {
			throw new Error(
				`Thrush operator requires function with at least one parameter, got ${rightResult.type.params.length}`
			);
		}

		currentState = unify(
			rightResult.type.params[0],
			leftResult.type,
			currentState,
			getExprLocation(expr)
		);

		// Return the function's return type (which may be a partially applied function)
		return createTypeResult(
			rightResult.type.return,
			unionEffects(leftResult.effects, rightResult.effects),
			currentState
		);
	}

	// Special handling for dollar operator ($) - low precedence function application
	if (expr.operator === '$') {
		// Dollar: a $ b means a(b) - apply left function to right value
		// Delegate to the same logic as regular function application

		// Create a synthetic ApplicationExpression for a $ b
		const syntheticApp: ApplicationExpression = {
			kind: 'application',
			func: expr.left,
			args: [expr.right],
			location: expr.location,
		};

		return typeApplication(syntheticApp, currentState);
	}

	// Special handling for safe thrush operator (|?) - desugar to bind call
	if (expr.operator === '|?') {
		// Safe thrush: a |? f desugars to: bind a f
		// Transform this into a function application and let constraint resolution handle it

		if (rightResult.type.kind !== 'function') {
			throwTypeError(
				location => nonFunctionApplicationError(rightResult.type, location),
				getExprLocation(expr)
			);
		}

		// Check that the function can take one parameter
		if (rightResult.type.params.length !== 1) {
			throw new Error(
				`Safe thrush operator requires function with exactly one parameter, got ${rightResult.type.params.length}`
			);
		}

		// Try constraint resolution first, fall back to direct implementation
		try {
			// Create a synthetic function application: bind(left)(right)

			const bindVar: VariableExpression = {
				kind: 'variable',
				name: 'bind',
				location: expr.location,
			};

			const syntheticApp: ApplicationExpression = {
				kind: 'application',
				func: bindVar,
				args: [expr.left, expr.right],
				location: expr.location,
			};

			// This will trigger constraint resolution for 'bind'
			return typeApplication(syntheticApp, currentState);
		} catch (error) {
			// If constraint resolution fails, fall back to direct implementation for known monads
			if (
				leftResult.type.kind === 'variant' &&
				leftResult.type.args.length >= 1
			) {
				const monadName = leftResult.type.name;
				const innerType = leftResult.type.args[0];

				if (monadName === 'Option' || monadName === 'Result') {
					// Unify the function parameter with the inner type
					currentState = unify(
						rightResult.type.params[0],
						innerType,
						currentState,
						getExprLocation(expr)
					);

					// The result type follows monadic bind semantics
					let resultType: Type;
					if (
						rightResult.type.return.kind === 'variant' &&
						rightResult.type.return.name === monadName
					) {
						// Function returns same monad type -> bind flattens
						resultType = rightResult.type.return;
					} else {
						// Function returns T -> wrap in the monad
						if (monadName === 'Option') {
							resultType = variantType('Option', [rightResult.type.return]);
						} else if (
							monadName === 'Result' &&
							leftResult.type.args.length === 2
						) {
							// Preserve error type for Result
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

			// Re-throw the original error if we can't handle it
			throw error;
		}
	}

	// Get operator type from environment
	const operatorScheme = currentState.environment.get(expr.operator);
	if (!operatorScheme) {
		throw new Error(`Unknown operator: ${expr.operator}`);
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
	// For now, assume imports return a record type
	return createPureTypeResult(recordType({}), state);
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
	const cachedType = state.accessorCache.get(fieldName);
	if (cachedType) {
		return createPureTypeResult(cachedType, state);
	}

	// Accessors return functions that take any record with the required field and return the field type
	// @bar should have type {bar: a, ...} -> a (allows extra fields)
	// Use a fresh type variable for the field type
	const [fieldType, nextState] = freshTypeVariable(state);
	// Create a simple type variable for the record (no constraints on the variable itself)
	const [recordVar, finalState] = freshTypeVariable(nextState);
	// Create a function type with constraints attached to both places
	const funcType = functionType([recordVar], fieldType);
	// Add the constraint to both the parameter type variable (for validation)
	// and the function type (for display)
	if (recordVar.kind === 'variable') {
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

	// Cache the result for future use
	const resultState = {
		...finalState,
		accessorCache: new Map(finalState.accessorCache).set(fieldName, funcType),
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
		if ((def as DefinitionExpression).kind === 'definition') {
			const definitionDef = def as DefinitionExpression;
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
		} else if (
			(def as MutableDefinitionExpression).kind === 'mutable-definition'
		) {
			const mutableDef = def as MutableDefinitionExpression;
			const valueResult = typeExpression(mutableDef.value, currentState);
			currentState = valueResult.state;

			whereEnv = mapSet(currentState.environment, mutableDef.name, {
				type: valueResult.type,
				quantifiedVars: [],
			});
			currentState = { ...currentState, environment: whereEnv };
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
export const typeTyped = (
	expr: TypedExpression,
	state: TypeState
): TypeResult => {
	// For typed expressions, validate that the explicit type matches the inferred type
	const inferredResult = typeExpression(expr.expression, state);
	const explicitType = expr.type;

	const newState = unify(
		inferredResult.type,
		explicitType,
		inferredResult.state,
		{
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		}
	);

	return createTypeResult(explicitType, inferredResult.effects, newState); // Use the explicit type
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

	for (const func of functions) {
		// Type the function signature, substituting the constraint type parameter
		const funcType = func.type;
		if (funcType.kind !== 'function') {
			throw new Error(`Function '${func.name}' is not a function`);
		}
		functionMap.set(func.name, funcType);
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
	const elementNames: string[] = [];
	
	// Extract variable names and create types for them
	for (const element of expr.pattern.elements) {
		if (element.kind === 'variable') {
			const [elementType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			elementTypes.push(elementType);
			elementNames.push(element.name);
		} else {
			// TODO: Handle nested destructuring
			throw new Error('Nested tuple destructuring not yet implemented');
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
	for (let i = 0; i < elementNames.length; i++) {
		const scheme = generalize(
			elementTypes[i],
			currentState.environment,
			currentState.substitution
		);
		const finalEnv = mapSet(currentState.environment, elementNames[i], scheme);
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
	const localBindings: { localName: string; fieldName: string; type: Type }[] = [];
	
	// Extract field information and create types
	for (const field of expr.pattern.fields) {
		if (field.kind === 'shorthand') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			localBindings.push({
				localName: field.fieldName, // shorthand: @name -> name
				fieldName: field.fieldName,
				type: fieldType
			});
		} else if (field.kind === 'rename') {
			const [fieldType, newState] = freshTypeVariable(currentState);
			currentState = newState;
			fieldTypes[field.fieldName] = fieldType;
			localBindings.push({
				localName: field.localName, // rename: @name userName -> userName
				fieldName: field.fieldName,
				type: fieldType
			});
		} else {
			// TODO: Handle nested destructuring
			throw new Error('Nested record destructuring not yet implemented');
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
		const finalEnv = mapSet(currentState.environment, binding.localName, scheme);
		currentState = { ...currentState, environment: finalEnv };
	}

	// Return the record type and effects
	return createTypeResult(expectedRecordType, valueResult.effects, currentState);
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
		
		if (e.kind === 'application' && e.func.kind === 'accessor' && e.args.length === 1) {
			const outerField = e.func.field;
			const innerArg = e.args[0];
			
			// Check for composition: @outer (@inner param)
			if (innerArg.kind === 'application' && 
				innerArg.func.kind === 'accessor' &&
				innerArg.args.length === 1 &&
				innerArg.args[0].kind === 'variable' &&
				paramTypeVars.has(innerArg.args[0].name)) {
				
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
									[outerField]: { kind: 'variable', name: resultVar }
								}
							}
						}
					}
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
