import {
	type ApplicationExpression,
	type PipelineExpression,
	type Type,
	type Constraint,
	type TraitConstraint,
	functionType,
	isConstraint,
	type Effect,
	type ConstrainedType,
	type FunctionType,
} from '../ast';
import {
	functionApplicationError,
	nonFunctionApplicationError,
	formatTypeError,
} from './type-errors';
import {
	getExprLocation,
	throwTypeError,
	typeToString,
	propagateConstraintToTypeVariable,
} from './helpers';
import {
	type TypeState,
	type TypeResult,
	createTypeResult,
	unionEffects,
} from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { typeExpression } from './expression-dispatcher';
import { freshTypeVariable } from './type-operations';
import { getTypeName, resolveTraitFunction } from './trait-system';

// CONSTRAINT COLLAPSE FIX: Function to try resolving constraints using argument types
export function tryResolveConstraints(
	returnType: Type,
	functionConstraints: Map<string, TraitConstraint[]>,
	argTypes: Type[],
	state: TypeState
): Type | null {
	
	// For each constraint, check if any of the argument types can satisfy it
	for (const [varName, constraints] of functionConstraints.entries()) {
		for (const constraint of constraints) {
			if (constraint.kind === 'implements') {
				const traitName = constraint.trait;
				
				// Check each argument type to see if it implements the required trait
				for (const argType of argTypes) {
					const argTypeName = getTypeName(argType);
					
					// Check if we have an implementation of this trait for this argument type
					let hasImplementation = false;
					
							// Built-in implementations for traits to avoid circular dependency
		if (traitName === 'Add' && (argTypeName === 'Float' || argTypeName === 'String')) {
			hasImplementation = true;
		} else if (traitName === 'Numeric' && (argTypeName === 'Float')) {
			hasImplementation = true;
					} else {
						// Check trait registry for user-defined implementations
						const traitRegistry = state.traitRegistry;
						if (traitRegistry) {
							const traitImpls = traitRegistry.implementations.get(traitName);
							hasImplementation = !!traitImpls && traitImpls.has(argTypeName);
						}
					}
					
					if (hasImplementation) {
						// This argument type satisfies the constraint!
						// Create a substitution and apply it to the return type
						const substitution = new Map(state.substitution);
						
						if (argType.kind === 'list') {
							// For List types, substitute the type constructor
							substitution.set(varName, { kind: 'primitive', name: 'List' });
						} else if (argType.kind === 'variant') {
							// For variant types, substitute with the constructor
							substitution.set(varName, {
								kind: 'variant',
								name: argType.name,
								args: [] // Just the constructor
							});
						} else {
							// For other types, substitute directly
							substitution.set(varName, argType);
						}
						
						// Apply substitution to return type
						const resolvedType = substitute(returnType, substitution);
						return resolvedType;
					}
				}
			}
		}
	}
	
	// Could not resolve any constraints
	return null;
}

// Helper function to continue function application with a specialized constraint function
function continueWithSpecializedFunction(
	expr: ApplicationExpression,
	specializedFuncType: Type,
	argTypes: Type[],
	allEffects: Set<Effect>,
	state: TypeState
): TypeResult {
	let currentState = state;

	if (specializedFuncType.kind !== 'function') {
		throwTypeError(
			location => nonFunctionApplicationError(specializedFuncType, location),
			getExprLocation(expr)
		);
	}

	const funcType = specializedFuncType;

	// Check argument count
	if (argTypes.length > funcType.params.length) {
		throwTypeError(
			location =>
				functionApplicationError(
					funcType.params[funcType.params.length - 1],
					argTypes[funcType.params.length - 1],
					funcType.params.length - 1,
					undefined,
					location
				),
			getExprLocation(expr)
		);
	}

	// Unify each argument with the corresponding parameter type
	for (let i = 0; i < argTypes.length; i++) {
		currentState = unify(
			funcType.params[i],
			argTypes[i],
			currentState,
			getExprLocation(expr),
			{
				reason: 'constraint_function_application',
				operation: `applying argument ${i + 1}`,
				hint: `Argument ${i + 1} has type ${typeToString(
					argTypes[i],
					currentState.substitution
				)} but the constraint function expects ${typeToString(
					funcType.params[i],
					currentState.substitution
				)}.`,
			}
		);
	}

	// Determine the result type
	let resultType = funcType.return;

	// If not all arguments were provided, create a partial application
	if (argTypes.length < funcType.params.length) {
		const remainingParams = funcType.params.slice(argTypes.length);
		resultType = functionType(
			remainingParams,
			funcType.return,
			funcType.effects
		);
	}

	// Merge effects from function type and arguments
	const finalEffects = unionEffects(allEffects, funcType.effects);

	return createTypeResult(resultType, finalEffects, currentState);
}

// LEGACY CONSTRAINT VALIDATION - REMOVED
// Will be replaced with new trait system
export const validateConstraints = (
	_type: Type,
	state: TypeState,
	_location?: { line: number; column: number }
): TypeState => {
	// No-op: constraint validation removed
	return state;
};

// Update typeApplication to thread state through freshenTypeVariables
export const typeApplication = (
	expr: ApplicationExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Type the function
	const funcResult = typeExpression(expr.func, currentState);
	currentState = funcResult.state;
	const funcType = funcResult.type;

	// Type each argument and collect effects
	const argTypes: Type[] = [];
	let allEffects = funcResult.effects;
	
	for (const arg of expr.args) {
		const argResult = typeExpression(arg, currentState);
		currentState = argResult.state;
		argTypes.push(argResult.type);
		allEffects = unionEffects(allEffects, argResult.effects);
	}

	// NEW: Try trait function resolution if we have arguments
	if (argTypes.length > 0) {
		// Check if this could be a trait function call
		if (expr.func.kind === 'variable') {
			const resolution = resolveTraitFunction(
				currentState.traitRegistry,
				expr.func.name,
				argTypes
			);
			
			if (resolution.found && resolution.impl) {
				// We found a trait implementation - evaluate it with the arguments
				// The trait implementation is an expression we need to type
				const traitImplType = typeExpression(resolution.impl, currentState);
				
				// Apply the trait implementation to the arguments
				if (traitImplType.type.kind === 'function') {
					// Create a new application expression using the trait implementation
					const traitApp: ApplicationExpression = {
						kind: 'application',
						func: resolution.impl,
						args: expr.args,
						location: expr.location
					};
					
					// Recursively type the new application
					return typeApplication(traitApp, currentState);
				} else {
					// The trait implementation should be a function
					const funcName = expr.func.kind === 'variable' ? expr.func.name : 'unknown';
					throwTypeError(
						location => ({
							type: 'TypeError' as const,
							kind: 'general',
							message: `Trait implementation for ${funcName} is not a function`,
							location
						}),
						getExprLocation(expr)
					);
				}
			}
		}
	}

	// Handle function application by checking if funcType is a function or constrained function
	let actualFuncType = funcType;
	let functionConstraints: Map<string, TraitConstraint[]> | undefined;
	
	// If it's a constrained type, extract the base type and constraints
	if (funcType.kind === 'constrained') {
		actualFuncType = funcType.baseType;
		functionConstraints = funcType.constraints;
	}
	
	if (actualFuncType.kind === 'function') {
		if (argTypes.length > actualFuncType.params.length) {
			throwTypeError(
				location =>
					functionApplicationError(
						actualFuncType.params[actualFuncType.params.length - 1],
						argTypes[actualFuncType.params.length - 1],
						actualFuncType.params.length - 1,
						undefined,
						location
					),
				getExprLocation(expr)
			);
		}

		// Unify each argument with the corresponding parameter type
		for (let i = 0; i < argTypes.length; i++) {
			// PHASE 3: Pass constraint context to unification if we have function constraints

			
			const unificationContext = {
				reason: 'function_application' as const,
				operation: `applying argument ${i + 1}`,
				hint: `Argument ${i + 1} has type ${typeToString(
					argTypes[i],
					currentState.substitution
				)} but the function parameter expects ${typeToString(
					actualFuncType.params[i],
					currentState.substitution
				)}.`,
				// Pass constraint information if available
				...(functionConstraints && { constraintContext: functionConstraints })
			};
			
			currentState = unify(
				actualFuncType.params[i],
				argTypes[i],
				currentState,
				getExprLocation(expr),
				unificationContext
			);

			// After unification, validate constraints on the parameter
			const substitutedParam = substitute(
				actualFuncType.params[i],
				currentState.substitution
			);

			// LEGACY CONSTRAINT VALIDATION - COMMENTED OUT
			// Will be replaced with new trait system
			
			// The old constraint validation logic has been removed
			// New trait system will handle constraint checking differently
		}

		// Apply substitution to get the return type
		const returnType = substitute(actualFuncType.return, currentState.substitution);

		// NOTE: Return type constraint validation removed - will be handled by new trait system

		// Phase 3: Add effect validation for function calls
		// Add function's effects to the collected effects
		allEffects = unionEffects(allEffects, actualFuncType.effects);

		if (argTypes.length === actualFuncType.params.length) {
			// Full application - return the return type
			
			// CONSTRAINT COLLAPSE FIX: Instead of blindly preserving constraints,
			// try to resolve them using the actual argument types
			let finalReturnType = returnType;
			if (functionConstraints && functionConstraints.size > 0) {
				// Try to resolve constraints using argument types
				const resolvedType = tryResolveConstraints(
					returnType,
					functionConstraints,
					argTypes,
					currentState
				);
				
				if (resolvedType) {
					// Constraints were successfully resolved to a concrete type
					finalReturnType = resolvedType;
				} else {
					// Could not resolve constraints, preserve them
					finalReturnType = {
						kind: 'constrained',
						baseType: returnType,
						constraints: functionConstraints
					};
				}
			}

			// CRITICAL FIX: Handle function composition constraint propagation

			// Case 1: Direct compose function call
			if (
				expr.func.kind === 'variable' &&
				expr.func.name === 'compose' &&
				expr.args.length >= 1
			) {
				const fArg = expr.args[0]; // First function (f in "compose f g")
				const fResult = typeExpression(fArg, currentState);

				// If f has constraints and returnType is a function, propagate the constraints
				if (
					fResult.type.kind === 'function' &&
					fResult.type.constraints &&
					returnType.kind === 'function'
				) {
					const enhancedReturnType = { ...returnType };

					// Map constraint variables from f's type to the new function's type variables
					const updatedConstraints: Constraint[] = [];
					for (const constraint of fResult.type.constraints) {
						if (constraint.kind === 'is') {
							// Find the corresponding parameter in the new function
							// The first parameter of the composed function should inherit f's parameter constraints
							if (
								enhancedReturnType.params.length > 0 &&
								enhancedReturnType.params[0].kind === 'variable'
							) {
								const newConstraint = isConstraint(
									enhancedReturnType.params[0].name,
									constraint.constraint
								);
								updatedConstraints.push(newConstraint);
							}
						} else {
							// For non-"is" constraints, copy as-is for now
							updatedConstraints.push(constraint);
						}
					}

					enhancedReturnType.constraints = (
						enhancedReturnType.constraints || []
					).concat(updatedConstraints);

					// Also propagate constraints to parameter type variables in the result function
					for (const constraint of updatedConstraints) {
						if (constraint.kind === 'is') {
							propagateConstraintToTypeVariable(enhancedReturnType, constraint);
						}
					}

					finalReturnType = enhancedReturnType;
				}
			}

			// Case 2: Application to result of compose (e.g., (compose head) id)
			else if (
				expr.func.kind === 'application' &&
				expr.func.func.kind === 'variable' &&
				expr.func.func.name === 'compose' &&
				expr.func.args.length >= 1
			) {
				// This is applying the second argument to a partial compose result
				const fArg = expr.func.args[0]; // First function from the compose
				const fResult = typeExpression(fArg, currentState);

				if (
					fResult.type.kind === 'function' &&
					fResult.type.constraints &&
					returnType.kind === 'function'
				) {
					const enhancedReturnType = { ...returnType };

					// Map constraint variables from f's type to the new function's type variables
					const updatedConstraints: Constraint[] = [];
					for (const constraint of fResult.type.constraints) {
						if (constraint.kind === 'is') {
							// Find the corresponding parameter in the new function
							if (
								enhancedReturnType.params.length > 0 &&
								enhancedReturnType.params[0].kind === 'variable'
							) {
								const newConstraint = isConstraint(
									enhancedReturnType.params[0].name,
									constraint.constraint
								);
								updatedConstraints.push(newConstraint);
							}
						} else {
							updatedConstraints.push(constraint);
						}
					}

					enhancedReturnType.constraints = (
						enhancedReturnType.constraints || []
					).concat(updatedConstraints);

					for (const constraint of updatedConstraints) {
						if (constraint.kind === 'is') {
							propagateConstraintToTypeVariable(enhancedReturnType, constraint);
						}
					}

					finalReturnType = enhancedReturnType;
				}
			}

			return createTypeResult(finalReturnType, allEffects, currentState);
		} else {
			// Partial application - return a function with remaining parameters
			const remainingParams = actualFuncType.params.slice(argTypes.length);
			const partialFunctionType = functionType(
				remainingParams,
				returnType,
				actualFuncType.effects
			);
			
			// If the original function had constraints, preserve them in the partial function
			let finalPartialType: ConstrainedType | FunctionType = partialFunctionType;
			if (functionConstraints && functionConstraints.size > 0) {
				finalPartialType = {
					kind: 'constrained',
					baseType: partialFunctionType,
					constraints: functionConstraints
				};
			}

			// CRITICAL FIX: Handle partial application of compose
			if (
				expr.func.kind === 'variable' &&
				expr.func.name === 'compose' &&
				expr.args.length >= 1
			) {
				const fArg = expr.args[0]; // First function
				const fResult = typeExpression(fArg, currentState);

				// If f has constraints, the partial result should eventually inherit them
				if (
					fResult.type.kind === 'function' &&
					fResult.type.constraints &&
					partialFunctionType.kind === 'function'
				) {
					partialFunctionType.constraints = (
						partialFunctionType.constraints || []
					).concat(fResult.type.constraints);

					for (const constraint of fResult.type.constraints) {
						if (constraint.kind === 'is') {
							propagateConstraintToTypeVariable(
								partialFunctionType,
								constraint
							);
						}
					}
				}
			}

			return createTypeResult(finalPartialType, allEffects, currentState);
		}
	} else if (funcType.kind === 'variable') {
		// If it's a type variable, create a function type and unify
		if (argTypes.length === 0) {
			return createTypeResult(funcType, allEffects, currentState);
		}

		const [paramType, newState] = freshTypeVariable(currentState);
		currentState = newState;
		const [returnType, finalState] = freshTypeVariable(currentState);
		currentState = finalState;

		const freshFunctionType = functionType([paramType], returnType);
		currentState = unify(funcType, freshFunctionType, currentState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});
		currentState = unify(paramType, argTypes[0], currentState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});

		return createTypeResult(
			substitute(returnType, currentState.substitution),
			allEffects,
			currentState
		);
	} else {
		throw new Error(
			formatTypeError(
				nonFunctionApplicationError(funcType, {
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				})
			)
		);
	}
};

// Type inference for pipeline expressions
export const typePipeline = (
	expr: PipelineExpression,
	state: TypeState
): TypeResult => {
	// Pipeline should be function composition, not function application
	// For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))

	if (expr.steps.length === 1) {
		return typeExpression(expr.steps[0], state);
	}

	// Start with the first function type
	let currentState = state;
	let composedType = typeExpression(expr.steps[0], currentState);
	currentState = composedType.state;
	let allEffects = composedType.effects;

	// Compose with each subsequent function type
	for (let i = 1; i < expr.steps.length; i++) {
		const nextFuncType = typeExpression(expr.steps[i], currentState);
		currentState = nextFuncType.state;
		allEffects = unionEffects(allEffects, nextFuncType.effects);

		if (
			composedType.type.kind === 'function' &&
			nextFuncType.type.kind === 'function'
		) {
			// Check that the output of composedType matches the input of nextFuncType
			if (nextFuncType.type.params.length !== 1) {
				throw new Error(
					formatTypeError(
						functionApplicationError(
							nextFuncType.type.params[0],
							nextFuncType.type,
							0,
							undefined,
							{
								line: expr.location?.start.line || 1,
								column: expr.location?.start.column || 1,
							}
						)
					)
				);
			}

			currentState = unify(
				composedType.type.return,
				nextFuncType.type.params[0],
				currentState,
				{
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				}
			);

			// The composed function takes the input of the first function and returns the output of the last function
			composedType = createTypeResult(
				functionType([composedType.type.params[0]], nextFuncType.type.return),
				allEffects,
				currentState
			);
		} else {
			throw new Error(
				`Cannot compose non-function types in pipeline: ${typeToString(
					composedType.type
				)} and ${typeToString(nextFuncType.type)}`
			);
		}
	}

	return createTypeResult(
		substitute(composedType.type, currentState.substitution),
		allEffects,
		currentState
	);
};
