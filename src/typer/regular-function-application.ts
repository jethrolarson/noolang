import {
	type ApplicationExpression,
	type Type,
	type Constraint,
	type FunctionType,
	type Effect,
	functionType,
} from '../ast';
import {
	throwTypeError,
	typeToString,
	propagateConstraintToTypeVariable,
} from './helpers';
import { functionApplicationError } from './type-errors';
import {
	type TypeState,
	type TypeResult,
	createTypeResult,
	unionEffects,
} from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { typeExpression } from './expression-dispatcher';
import { Expression } from '../ast';
import { tryResolveConstraints } from './constraint-resolution';
import { handleComposeConstraintPropagation } from './function-composition';

// Helper function to handle regular function application
export function handleRegularFunctionApplication(
	expr: ApplicationExpression,
	actualFuncType: FunctionType,
	argTypes: Type[],
	functionConstraints: Constraint[] | undefined,
	currentState: TypeState,
	allEffects: Set<Effect>
): TypeResult {
	// Helper: get leftmost root function variable name
	const getRootFuncName = (e: Expression): string | null => {
		if (e.kind === 'variable') return e.name;
		if (e.kind === 'application') return getRootFuncName(e.func);
		return null;
	};
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
			{
				line: expr.location?.start.line || 1,
				column: expr.location?.start.column || 1,
			}
		);
	}

	// Unify each argument with the corresponding parameter type
	let skipOptionUnknownForAt = false;
	const rootName = getRootFuncName(expr.func);
	for (let i = 0; i < argTypes.length; i++) {
		// Special-case: allow at idx Unknown -> Option Unknown by skipping unification
		const expectedParam = substitute(
			actualFuncType.params[i],
			currentState.substitution
		);
		const actualArg = substitute(argTypes[i], currentState.substitution);
		if (
			rootName === 'at' &&
			expectedParam.kind === 'list' &&
			actualArg.kind === 'unknown'
		) {
			skipOptionUnknownForAt = true;
			continue;
		}
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
			{
				line: expr.location?.start.line || 1,
				column: expr.location?.start.column || 1,
			},
			unificationContext
		);
	}

	// Apply substitution to get the return type
	let returnType = substitute(actualFuncType.return, currentState.substitution);

	// Add function's effects to the collected effects
	allEffects = unionEffects(allEffects, actualFuncType.effects);

	if (argTypes.length === actualFuncType.params.length) {
		// SPECIAL CASES for Unknown support
		// 1) Optional accessor applied to Unknown should yield Option Unknown
		if (
			expr.func.kind === 'accessor' &&
			expr.func.optional === true &&
			argTypes.length >= 1
		) {
			const substitutedArg = substitute(argTypes[0], currentState.substitution);
			if (substitutedArg.kind === 'unknown') {
				returnType = {
					kind: 'variant',
					name: 'Option',
					args: [{ kind: 'unknown' }],
				};
			}
		}

		// 2) at index on Unknown container should yield Option Unknown
		if (skipOptionUnknownForAt) {
			returnType = {
				kind: 'variant',
				name: 'Option',
				args: [{ kind: 'unknown' }],
			};
		}

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
				// Could not resolve constraints, preserve them on the return type
				if (returnType.kind === 'function') {
					finalReturnType = {
						...returnType,
						constraints: (returnType.constraints || []).concat(
							functionConstraints
						),
					};
				} else {
					// For non-function types, create a constrained type to preserve the constraints
					// This handles cases like `map f list` returning `f b given f implements Functor`
					const constraintMap = new Map<string, Constraint[]>();

					// Group constraints by type variable
					for (const constraint of functionConstraints) {
						if (constraint.kind === 'implements') {
							const typeVar = constraint.typeVar;
							const existing = constraintMap.get(typeVar) || [];
							existing.push(constraint);
							constraintMap.set(typeVar, existing);
						}
					}

					if (constraintMap.size > 0) {
						finalReturnType = {
							kind: 'constrained',
							baseType: returnType,
							constraints: constraintMap,
						};
					} else {
						finalReturnType = returnType;
					}
				}
			}
		}

		// Handle function composition constraint propagation
		finalReturnType = handleComposeConstraintPropagation(
			expr,
			finalReturnType,
			currentState
		);

		return createTypeResult(finalReturnType, allEffects, currentState);
	} else {
		// Partial application - return a function with remaining parameters
		const remainingParams = actualFuncType.params.slice(argTypes.length);

		// Apply substitution to remaining parameters to preserve unification results
		const substitutedRemainingParams = remainingParams.map(param =>
			substitute(param, currentState.substitution)
		);

		const partialFunctionType = functionType(
			substitutedRemainingParams,
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

		// Handle partial application of compose
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
						propagateConstraintToTypeVariable(partialFunctionType, constraint);
					}
				}
			}
		}

		return createTypeResult(finalPartialType, allEffects, currentState);
	}
}
