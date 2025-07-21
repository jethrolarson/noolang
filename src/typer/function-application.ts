import {
	type ApplicationExpression,
	type PipelineExpression,
	type Type,
	type Constraint,
	functionType,
	isConstraint,
} from '../ast';
import {
	functionApplicationError,
	nonFunctionApplicationError,
	formatTypeError,
	createTypeError,
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
	unionEffects 
} from './types';
import { 
	validateFunctionCall, 
	areEffectsCompatible,
	mergeEffects 
} from './effect-validation';
import { satisfiesConstraint } from './constraints';
import { substitute } from './substitute';
import { unify } from './unify';
import { freshTypeVariable, instantiate } from './type-operations';
import { typeExpression } from './expression-dispatcher';
import { 
	tryResolveConstraintFunction, 
	generateConstraintError,
	decorateEnvironmentWithConstraintFunctions 
} from './constraint-resolution';

// Helper function to continue function application with a specialized constraint function
function continueWithSpecializedFunction(
	expr: ApplicationExpression,
	specializedFuncType: Type,
	argTypes: Type[],
	allEffects: Set<import('../ast').Effect>,
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
		resultType = functionType(remainingParams, funcType.return, funcType.effects);
	}

	// Merge effects from function type and arguments
	const finalEffects = unionEffects(allEffects, funcType.effects);

	return createTypeResult(resultType, finalEffects, currentState);
}

// Comprehensive constraint validation
export const validateConstraints = (
	type: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState => {
	let currentState = state;

	// Apply substitution to get the concrete type
	const substitutedType = substitute(type, state.substitution);

	// If it's a type variable with constraints, check them
	if (substitutedType.kind === 'variable' && substitutedType.constraints) {
		for (const constraint of substitutedType.constraints) {
			// currentState = solveConstraint(constraint, currentState, location);
		}
	}

	// If it's a function type, check constraints on parameters and return type
	if (substitutedType.kind === 'function') {
		// Check constraints on parameters
		for (const param of substitutedType.params) {
			currentState = validateConstraints(param, currentState, location);
		}

		// Check constraints on return type
		currentState = validateConstraints(
			substitutedType.return,
			currentState,
			location
		);

		// Check function-level constraints
		if (substitutedType.constraints) {
			// currentState = solveConstraints(
			// 	substitutedType.constraints,
			// 	currentState,
			// 	location
			// );
		}
	}

	// If it's a list type, check constraints on element type
	if (substitutedType.kind === 'list') {
		currentState = validateConstraints(
			substitutedType.element,
			currentState,
			location
		);
	}

	// If it's a record type, check constraints on field types
	if (substitutedType.kind === 'record') {
		for (const fieldType of Object.values(substitutedType.fields)) {
			currentState = validateConstraints(fieldType, currentState, location);
		}
	}

	return currentState;
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
		argTypes.push(argResult.type);
		currentState = argResult.state;
		allEffects = unionEffects(allEffects, argResult.effects);
	}

	// Check if this is a constraint function call that needs resolution
	// ONLY apply to functions that are explicitly defined in constraints
	if (expr.func.kind === 'variable' && currentState.constraintRegistry.size > 0) {
		// Only check constraint resolution if the function is explicitly in a constraint
		let isDefinedInConstraint = false;
		for (const [, constraintInfo] of currentState.constraintRegistry) {
			if (constraintInfo.signature.functions.has(expr.func.name)) {
				isDefinedInConstraint = true;
				break;
			}
		}
		
		// ONLY apply constraint resolution to explicitly defined constraint functions
		// This excludes ADT constructors like Point, Rectangle, etc.
		if (isDefinedInConstraint) {
			const constraintResolution = tryResolveConstraintFunction(
				expr.func.name,
				expr.args,
				argTypes,
				currentState
			);
			
			if (constraintResolution.resolved && constraintResolution.specializedName) {
				// This is a constraint function call with a concrete resolution
				// Look up the specialized function in the environment
				const decoratedState = decorateEnvironmentWithConstraintFunctions(currentState);
				const specializedScheme = decoratedState.environment.get(constraintResolution.specializedName);
				
				if (specializedScheme) {
					// Use the specialized implementation
					const [instantiatedType, newState] = instantiate(specializedScheme, decoratedState);
					
					// The specialized function should match the call pattern
					if (instantiatedType.kind === 'function') {
						// Continue with normal function application using the specialized type
						const specializedFuncType = instantiatedType;
						// Replace funcType with specializedFuncType for the rest of the function
						return continueWithSpecializedFunction(
							expr, 
							specializedFuncType, 
							argTypes, 
							allEffects, 
							newState
						);
					}
				} else {
					// Could not resolve - generate helpful error
					const firstArgType = argTypes.length > 0 ? substitute(argTypes[0], currentState.substitution) : null;
					if (firstArgType && firstArgType.kind !== 'variable') {
						// We have a concrete type but no implementation
						const errorMessage = generateConstraintError(
							expr.func.name, // This should be parsed differently, but for now using function name
							expr.func.name,
							firstArgType,
							currentState
						);
						throw new Error(errorMessage);
					}
				}
			}
		}
	}

	// Handle function application by checking if funcType is a function
	if (funcType.kind === 'function') {
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
					reason: 'function_application',
					operation: `applying argument ${i + 1}`,
					hint: `Argument ${i + 1} has type ${typeToString(
						argTypes[i],
						currentState.substitution
					)} but the function parameter expects ${typeToString(
						funcType.params[i],
						currentState.substitution
					)}.`,
				}
			);

			// After unification, validate constraints on the parameter
			const substitutedParam = substitute(
				funcType.params[i],
				currentState.substitution
			);

			// Check if the parameter has constraints that need to be validated
			if (
				substitutedParam.kind === 'variable' &&
				substitutedParam.constraints
			) {
				// Validate each constraint
				for (const constraint of substitutedParam.constraints) {
					if (constraint.kind === 'is') {
						// Check if the type variable has been unified to a concrete type
						const concreteType = currentState.substitution.get(
							constraint.typeVar
						);
						if (concreteType && concreteType.kind !== 'variable') {
							// The type variable has been unified to a concrete type, validate the constraint
							if (!satisfiesConstraint(concreteType, constraint.constraint)) {
								throw new Error(
									formatTypeError(
										createTypeError(
											`Type ${typeToString(
												concreteType,
												currentState.substitution
											)} does not satisfy constraint '${
												constraint.constraint
											}'`,
											{},
											{
												line: expr.location?.start.line || 1,
												column: expr.location?.start.column || 1,
											}
										)
									)
								);
							}
						}
					}
				}
			}

			// Also validate constraints on the argument type
			const substitutedArg = substitute(argTypes[i], currentState.substitution);
			if (substitutedArg.kind === 'variable' && substitutedArg.constraints) {
				for (const constraint of substitutedArg.constraints) {
					if (constraint.kind === 'is') {
						const concreteType = currentState.substitution.get(
							constraint.typeVar
						);
						if (concreteType && concreteType.kind !== 'variable') {
							if (!satisfiesConstraint(concreteType, constraint.constraint)) {
								throw new Error(
									formatTypeError(
										createTypeError(
											`Type ${typeToString(
												concreteType,
												currentState.substitution
											)} does not satisfy constraint '${
												constraint.constraint
											}'`,
											{},
											{
												line: expr.location?.start.line || 1,
												column: expr.location?.start.column || 1,
											}
										)
									)
								);
							}
						}
					}
				}
			}

			// CRITICAL: Also check if the argument type itself satisfies constraints
			// This is needed for cases where the argument is a concrete type that should satisfy constraints
			if (substitutedArg.kind !== 'variable') {
				// Check if the parameter has constraints that the argument should satisfy
				if (
					substitutedParam.kind === 'variable' &&
					substitutedParam.constraints
				) {
					for (const constraint of substitutedParam.constraints) {
						if (constraint.kind === 'is') {
							if (!satisfiesConstraint(substitutedArg, constraint.constraint)) {
								throw new Error(
									formatTypeError(
										createTypeError(
											`Type ${typeToString(
												substitutedArg,
												currentState.substitution
											)} does not satisfy constraint '${
												constraint.constraint
											}'`,
											{},
											{
												line: expr.location?.start.line || 1,
												column: expr.location?.start.column || 1,
											}
										)
									)
								);
							}
						}
					}
				}
			}
		}

		// Apply substitution to get the return type
		const returnType = substitute(funcType.return, currentState.substitution);

		// Validate constraints on the return type
		currentState = validateConstraints(returnType, currentState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});

		// Phase 3: Add effect validation for function calls
		// Add function's effects to the collected effects
		allEffects = unionEffects(allEffects, funcType.effects);

		if (argTypes.length === funcType.params.length) {
			// Full application - return the return type

			// CRITICAL FIX: Handle function composition constraint propagation
			let finalReturnType = returnType;

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
			const remainingParams = funcType.params.slice(argTypes.length);
			const partialFunctionType = functionType(remainingParams, returnType, funcType.effects);

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

			return createTypeResult(partialFunctionType, allEffects, currentState);
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
				functionType(
					[composedType.type.params[0]],
					nextFuncType.type.return
				),
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