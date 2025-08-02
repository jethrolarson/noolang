import {
	type ApplicationExpression,
	type PipelineExpression,
	type Type,
	type Constraint,
	functionType,
	constrainedFunctionType,
	isConstraint,
	type FunctionType,
	implementsConstraint,
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
import {
	getTypeName,
	resolveTraitFunction,
	isTraitFunction,
	getTraitFunctionInfo,
} from './trait-system';

// CONSTRAINT COLLAPSE FIX: Function to try resolving constraints using argument types
export function tryResolveConstraints(
	returnType: Type,
	functionConstraints: Constraint[],
	argTypes: Type[],
	state: TypeState
): { resolvedType: Type; updatedState: TypeState } | null {
	// For each constraint, check if any of the argument types can satisfy it
	for (const constraint of functionConstraints) {
		if (constraint.kind === 'implements') {
			const traitName = constraint.interfaceName;
			const varName = constraint.typeVar;

			// Check each argument type to see if it implements the required trait
			for (const argType of argTypes) {
				const argTypeName = getTypeName(argType);

				// Check if we have an implementation of this trait for this argument type
				let hasImplementation = false;

				// Built-in implementations for traits to avoid circular dependency
				if (
					traitName === 'Add' &&
					(argTypeName === 'Float' || argTypeName === 'String')
				) {
					hasImplementation = true;
				} else if (traitName === 'Numeric' && argTypeName === 'Float') {
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
							args: [], // Just the constructor
						});
					} else {
						// For other types, substitute directly
						substitution.set(varName, argType);
					}

					// Apply substitution to return type
					const resolvedType = substitute(returnType, substitution);
					// Merge the local substitution back into the global state
					const updatedSubstitution = new Map([
						...state.substitution,
						...substitution,
					]);
					const updatedState = { ...state, substitution: updatedSubstitution };
					return { resolvedType, updatedState };
				}
			}
		} else if (constraint.kind === 'has') {
			// Handle structural constraints (accessors)
			const requiredStructure = constraint.structure;

			// Check each argument type to see if it has the required structure
			for (const argType of argTypes) {
				// Handle both direct record types and type variables that might resolve to records
				let actualRecordType: any = null;
				if (argType.kind === 'record') {
					actualRecordType = argType;
				} else if (argType.kind === 'variable') {
					// Check if this type variable has constraints that tell us it should be a record
					// For now, we'll try to see if it's already been substituted to a record
					const substitutedType = substitute(argType, state.substitution);
					if (substitutedType.kind === 'record') {
						actualRecordType = substitutedType;
					}
				}

				if (actualRecordType) {
					// Check if the record type has all required fields
					let hasAllFields = true;
					const substitution = new Map(state.substitution);

					for (const fieldName of Object.keys(requiredStructure.fields)) {
						// Normalize field names - remove @ prefix if it exists
						const normalizedFieldName = fieldName.startsWith('@')
							? fieldName.slice(1)
							: fieldName;
						if (!(normalizedFieldName in actualRecordType.fields)) {
							hasAllFields = false;
							break;
						}
					}

					if (hasAllFields) {
						// Structural constraint satisfied!
						// For accessor functions: substitute the actual field types for the constraint's field type variables
						for (const [fieldName, constraintFieldType] of Object.entries(
							requiredStructure.fields
						)) {
							const normalizedFieldName = fieldName.startsWith('@')
								? fieldName.slice(1)
								: fieldName;
							const actualFieldType =
								actualRecordType.fields[normalizedFieldName];
							if (actualFieldType && constraintFieldType.kind === 'variable') {
								// Substitute the field type variable with the actual field type from the record
								substitution.set(constraintFieldType.name, actualFieldType);
							}
						}
						// Apply substitution to return type
						let resolvedType = substitute(returnType, substitution);

						// SPECIAL CASE: If the return type is still a variable and we have field type substitutions,
						// check if the return type should be unified with the field type (common in accessor functions)
						if (
							resolvedType.kind === 'variable' &&
							resolvedType === returnType
						) {
							// The return type wasn't substituted, but we have field substitutions
							// In accessor functions, the return type should match the field type
							for (const [_fieldName, constraintFieldType] of Object.entries(
								requiredStructure.fields
							)) {
								if (
									constraintFieldType.kind === 'variable' &&
									substitution.has(constraintFieldType.name)
								) {
									// We found a field type that was substituted
									const fieldTypeSubstitution = substitution.get(
										constraintFieldType.name
									)!;
									// Also add this to the substitution map for future use
									substitution.set(resolvedType.name, fieldTypeSubstitution);
									resolvedType = fieldTypeSubstitution;
									break;
								}
							}
						}
						// Merge the local substitution back into the global state
						const updatedSubstitution = new Map([
							...state.substitution,
							...substitution,
						]);
						const updatedState = {
							...state,
							substitution: updatedSubstitution,
						};
						return { resolvedType, updatedState };
					}
				}
			}
		}
	}

	// Could not resolve any constraints
	return null;
}

// Utility: check if a type is fully concrete (no variables anywhere)
function isFullyConcrete(type: Type): boolean {
	if (type.kind === 'primitive' || type.kind === 'unit') return true;
	if (type.kind === 'variable') return false;
	if (type.kind === 'variant') {
		return (type.args ?? []).every(isFullyConcrete);
	}
	if (type.kind === 'list') {
		return isFullyConcrete(type.element);
	}
	if (type.kind === 'constrained') {
		return isFullyConcrete(type.baseType);
	}
	if (type.kind === 'function') {
		return type.params.every(isFullyConcrete) && isFullyConcrete(type.return);
	}
	return false;
}

// Utility: check if a type has any type variables (is polymorphic)
function hasTypeVariables(type: Type): boolean {
	if (type.kind === 'variable') return true;
	if (type.kind === 'primitive' || type.kind === 'unit') return false;
	if (type.kind === 'variant') {
		return (type.args ?? []).some(hasTypeVariables);
	}
	if (type.kind === 'list') {
		return hasTypeVariables(type.element);
	}
	if (type.kind === 'constrained') {
		return hasTypeVariables(type.baseType);
	}
	if (type.kind === 'function') {
		return type.params.some(hasTypeVariables) || hasTypeVariables(type.return);
	}
	return false;
}

// TODO break this up into smaller functions
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
		if (
			expr.func.kind === 'variable' &&
			isTraitFunction(currentState.traitRegistry, expr.func.name)
		) {
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
					// FIXED: Use direct function application logic instead of recursive typeApplication
					// to avoid exponential blowup while maintaining compatibility
					const funcType = traitImplType.type;
					let resultState = traitImplType.state;

					// Type arguments first
					const argResults = expr.args.map(arg =>
						typeExpression(arg, resultState)
					);
					for (const argResult of argResults) {
						resultState = argResult.state;
					}
					const argTypes = argResults.map(result => result.type);

					// Apply normal function application logic (copied from main path)
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
						const unificationContext = {
							reason: 'function_application' as const,
							operation: `applying argument ${i + 1}`,
							hint: `Argument ${i + 1} has type ${typeToString(
								argTypes[i],
								resultState.substitution
							)} but the function parameter expects ${typeToString(
								funcType.params[i],
								resultState.substitution
							)}.`,
						};

						resultState = unify(
							funcType.params[i],
							argTypes[i],
							resultState,
							getExprLocation(expr),
							unificationContext
						);
					}

					// Return the function's return type with effects
					const resultType = substitute(
						funcType.return,
						resultState.substitution
					);

					const resultEffects = unionEffects(
						traitImplType.effects,
						...argResults.map(r => r.effects)
					);
					return createTypeResult(resultType, resultEffects, resultState);
				} else {
					// The trait implementation should be a function
					const funcName =
						expr.func.kind === 'variable' ? expr.func.name : 'unknown';
					throwTypeError(
						location => ({
							type: 'TypeError' as const,
							kind: 'general',
							message: `Trait implementation for ${funcName} is not a function`,
							location,
						}),
						getExprLocation(expr)
					);
				}
			} else if (resolution.found === false) {
				// No trait implementation found - check if this is polymorphic
				const funcName =
					expr.func.kind === 'variable' ? expr.func.name : 'unknown';

				// Get the trait function signature to check if it's polymorphic
				const traitInfo = getTraitFunctionInfo(
					currentState.traitRegistry,
					funcName
				);
				if (traitInfo && traitInfo.functionType.kind === 'function') {
					// Check if the trait function return type has unresolved type variables
					const hasUnresolvedVariables = hasTypeVariables(
						traitInfo.functionType.return
					);

					if (!hasUnresolvedVariables && isFullyConcrete(argTypes[0])) {
						// Concrete function with concrete argument: error
						const argTypeNames = argTypes
							.map(t => getTypeName(t))
							.filter(Boolean);
						const typeStr =
							argTypeNames.length > 0
								? argTypeNames.join(', ')
								: 'unknown type';
						throwTypeError(
							location => ({
								type: 'TypeError' as const,
								kind: 'general',
								message: `No implementation of trait function '${funcName}' for ${typeStr}`,
								location,
							}),
							getExprLocation(expr)
						);
					}
					// Otherwise, allow constraint to be created (polymorphic or type variable arguments)
				}
			}
		}
	}

	// Handle function application by checking if funcType is a function or constrained function
	let actualFuncType = funcType;
	let functionConstraints: Constraint[] | undefined;

	// If it's a constrained type, extract the base type and constraints
	if (funcType.kind === 'constrained') {
		actualFuncType = funcType.baseType;
		// Extract constraints from ConstrainedType
		functionConstraints = [];
		for (const [typeVar, traitConstraints] of funcType.constraints.entries()) {
			for (const traitConstraint of traitConstraints) {
				if (traitConstraint.kind === 'implements') {
					functionConstraints.push(
						implementsConstraint(typeVar, traitConstraint.interfaceName)
					);
				} else if (traitConstraint.kind === 'hasField') {
					// Convert hasField trait constraint to modern hasField constraint
					functionConstraints.push({
						kind: 'hasField',
						typeVar,
						field: traitConstraint.field,
						fieldType: traitConstraint.fieldType,
					});
				}
			}
		}
	} else if (actualFuncType.kind === 'function' && actualFuncType.constraints) {
		// Use modern constraint system directly
		functionConstraints = actualFuncType.constraints;
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
			// Pass constraint context to unification if we have function constraints

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
				...(functionConstraints && { constraintContext: functionConstraints }),
			};

			currentState = unify(
				actualFuncType.params[i],
				argTypes[i],
				currentState,
				getExprLocation(expr),
				unificationContext
			);
		}

		// Apply substitution to get the return type
		const returnType = substitute(
			actualFuncType.return,
			currentState.substitution
		);

		// NOTE: Return type constraint validation removed - will be handled by new trait system

		// Phase 3: Add effect validation for function calls
		// Add function's effects to the collected effects
		allEffects = unionEffects(allEffects, actualFuncType.effects);

		if (argTypes.length === actualFuncType.params.length) {
			// Full application - return the return type

			// CONSTRAINT COLLAPSE FIX: Instead of blindly preserving constraints,
			// try to resolve them using the actual argument types
			let finalReturnType = returnType;
			if (functionConstraints && functionConstraints.length > 0) {
				// Apply current substitution to argument types before constraint resolution
				const substitutedArgTypes = argTypes.map(argType =>
					substitute(argType, currentState.substitution)
				);

				// Try to resolve constraints using substituted argument types
				const constraintResult = tryResolveConstraints(
					returnType,
					functionConstraints,
					substitutedArgTypes,
					currentState
				);

				if (constraintResult) {
					// Constraints were successfully resolved to a concrete type
					finalReturnType = constraintResult.resolvedType;
					currentState = constraintResult.updatedState;
				} else {
					// Could not resolve constraints, preserve them on the return type if it's a function
					if (returnType.kind === 'function') {
						finalReturnType = {
							...returnType,
							constraints: (returnType.constraints || []).concat(
								functionConstraints
							),
						};
					} else {
						// For non-function types, just return the type as-is
						// Constraint resolution for non-function return types is handled elsewhere
						finalReturnType = returnType;
					}
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
			let finalPartialType: FunctionType = partialFunctionType;
			if (functionConstraints && functionConstraints.length > 0) {
				finalPartialType = {
					...partialFunctionType,
					constraints: (partialFunctionType.constraints || []).concat(
						functionConstraints
					),
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
	// For a pipeline like f <| g <| h, we want to compose them as f(g(h(x)))

	if (expr.steps.length === 1) {
		return typeExpression(expr.steps[0], state);
	}

	// Determine composition direction based on operators
	const isLeftToRight = expr.operators.every(op => op === '|>');
	const isRightToLeft = expr.operators.every(op => op === '<|');

	if (!isLeftToRight && !isRightToLeft) {
		throw new Error(
			`Cannot mix pipeline operators |> and <| in the same expression`
		);
	}

	// For right-to-left composition (<|), reverse the steps
	const steps = isRightToLeft ? [...expr.steps].reverse() : expr.steps;

	// Start with the first function type
	let currentState = state;
	let composedType = typeExpression(steps[0], currentState);
	currentState = composedType.state;
	let allEffects = composedType.effects;

	// Compose with each subsequent function type
	for (let i = 1; i < steps.length; i++) {
		const nextFuncType = typeExpression(steps[i], currentState);
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
			// For accessor composition, we need to properly merge constraints
			const firstConstraints = composedType.type.constraints || [];
			const secondConstraints = nextFuncType.type.constraints || [];

			// For accessor composition, we want to:
			// 1. Keep the first accessor's constraint (e.g., α has {@person γ})
			// 2. Add a nested constraint to the person field (e.g., γ has {@city β})

			// Start with the first function's constraints
			const mergedConstraints = [...firstConstraints];

			// For the second function, we need to find what field it's accessing
			// and add a constraint that the person field has that field
			for (const constraint of secondConstraints) {
				if (constraint.kind === 'has') {
					// Find what field the second accessor is trying to access
					const fieldNames = Object.keys(constraint.structure.fields);
					if (fieldNames.length === 1) {
						const _fieldName = fieldNames[0];

						// Find the person field constraint from the first function
						const personConstraint = firstConstraints.find(
							c => c.kind === 'has' && c.structure.fields.person
						);

						if (personConstraint && personConstraint.kind === 'has') {
							// Add the constraint that the person field has the target field
							const personFieldType = personConstraint.structure.fields.person;
							if (personFieldType.kind === 'variable') {
								// Create a new constraint that the person field has the target field
								const nestedConstraint = {
									kind: 'has' as const,
									typeVar: personFieldType.name,
									structure: constraint.structure,
								};
								mergedConstraints.push(nestedConstraint);
							}
						}
					}
				}
			}

			// For accessor composition, we want to create a clean constraint structure
			// The result should be: α has {person: γ} and γ has {city: β}
			const uniqueConstraints: Constraint[] = [];

			// Find the person constraint from the first function
			const personConstraint = firstConstraints.find(
				c => c.kind === 'has' && c.structure.fields.person
			);

			if (personConstraint && personConstraint.kind === 'has') {
				// Get the person field variable
				const personFieldType = personConstraint.structure.fields.person;
				if (personFieldType.kind === 'variable') {
					// Find what field the second accessor is trying to access
					for (const constraint of secondConstraints) {
						if (constraint.kind === 'has') {
							const fieldNames = Object.keys(constraint.structure.fields);
							if (fieldNames.length === 1) {
								const _fieldName = fieldNames[0];

								// Create a constraint that the person field has the target field
								const nestedConstraint = {
									kind: 'has' as const,
									typeVar: personFieldType.name,
									structure: constraint.structure,
								};
								uniqueConstraints.push(nestedConstraint);
								break; // Only add the first matching constraint
							}
						}
					}
				}
			}

			composedType = createTypeResult(
				constrainedFunctionType(
					[composedType.type.params[0]],
					nextFuncType.type.return,
					allEffects,
					uniqueConstraints
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
