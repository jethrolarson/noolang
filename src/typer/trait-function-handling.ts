import {
	type ApplicationExpression,
	type Type,
	type Constraint,
	type FunctionType,
} from '../ast';
import { throwTypeError, typeToString } from './helpers';
import {
	type TypeState,
	type TypeResult,
	createTypeResult,
	unionEffects,
} from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { typeExpression } from './expression-dispatcher';
import {
	getTypeName,
	resolveTraitFunction,
	isTraitFunction,
	getTraitFunctionInfo,
} from './trait-system';

// Helper function to handle trait function resolution
export function handleTraitFunctionApplication(
	expr: ApplicationExpression,
	funcType: Type,
	argTypes: Type[],
	currentState: TypeState,
	funcResult: TypeResult
): TypeResult | null {
	// Check if this could be a trait function call
	if (
		expr.func.kind === 'variable' &&
		isTraitFunction(currentState.traitRegistry, expr.func.name)
	) {
		// Get the trait function signature to understand its arity
		const traitInfo = getTraitFunctionInfo(
			currentState.traitRegistry,
			expr.func.name
		);
		if (traitInfo && traitInfo.functionType.kind === 'function') {
			const traitFuncType = traitInfo.functionType;

			// For trait functions, we need to check if we have enough arguments to fully apply the function
			// A trait function like `add : a -> a -> a` needs 2 arguments to be fully applied
			// We can determine this by checking if the return type is still a function type
			const isFullyApplied = traitFuncType.return.kind !== 'function';

			if (!isFullyApplied) {
				return handlePartialTraitFunctionApplication(
					expr,
					traitFuncType,
					argTypes,
					currentState,
					funcResult
				);
			}

			// Only resolve trait functions when fully applied
			if (isFullyApplied) {
				return handleFullTraitFunctionApplication(
					expr,
					traitFuncType,
					argTypes,
					currentState
				);
			}
		}
	}
	return null;
}

// Helper function to handle partial trait function application
function handlePartialTraitFunctionApplication(
	expr: ApplicationExpression,
	traitFuncType: FunctionType,
	argTypes: Type[],
	currentState: TypeState,
	funcResult: TypeResult
): TypeResult {
	// Partial application: return a function type with remaining parameters and constraints
	// Unify the supplied arguments with the corresponding parameters
	let partialState = currentState;
	for (let i = 0; i < argTypes.length; i++) {
		partialState = unify(traitFuncType.params[i], argTypes[i], partialState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});
	}
	// Build the remaining curried function type
	// For curried functions, we need to handle the case where we've applied one argument
	// and the return type is still a function
	const resultType = substitute(
		traitFuncType.return,
		partialState.substitution
	);
	let curriedType: Type = resultType;
	// Collect constraints from both the trait function and the argument types
	const allConstraints: Constraint[] = [];

	// Add trait function constraints (e.g., f implements Functor)
	if (traitFuncType.constraints && traitFuncType.constraints.length > 0) {
		const substitutedConstraints = traitFuncType.constraints.map(constraint => {
			if (constraint.kind === 'implements') {
				const substitutedVar = substitute(
					{ kind: 'variable', name: constraint.typeVar },
					partialState.substitution
				);

				if (substitutedVar.kind === 'variable') {
					return {
						...constraint,
						typeVar: substitutedVar.name,
					};
				}
				return null;
			}
			return constraint;
		});
		allConstraints.push(...substitutedConstraints.filter(c => c !== null));
	}

	// Add constraints from argument types (e.g., a has {@name b} from @name)
	for (let i = 0; i < argTypes.length; i++) {
		const argType = argTypes[i];
		if (argType.kind === 'function' && argType.constraints) {
			// For now, just propagate the constraints directly with variable substitution
			const substitutedArgConstraints = argType.constraints.map(constraint => {
				// Apply substitution to update variable names
				const substitutedVar = substitute(
					{ kind: 'variable', name: constraint.typeVar },
					partialState.substitution
				);

				if (substitutedVar.kind === 'variable') {
					return {
						...constraint,
						typeVar: substitutedVar.name,
					};
				}
				return constraint;
			});
			allConstraints.push(...substitutedArgConstraints);
		}
	}

	// Apply constraints to the result type if it's a function
	if (resultType.kind === 'function' && allConstraints.length > 0) {
		curriedType = {
			...resultType,
			constraints: (resultType.constraints || []).concat(allConstraints),
		};
	}
	return createTypeResult(curriedType, funcResult.effects, partialState);
}

// Helper function to handle full trait function application
function handleFullTraitFunctionApplication(
	expr: ApplicationExpression,
	traitFuncType: FunctionType,
	argTypes: Type[],
	currentState: TypeState
): TypeResult | null {
	const funcName = expr.func.kind === 'variable' ? expr.func.name : 'unknown';
	const resolution = resolveTraitFunction(
		currentState.traitRegistry,
		funcName,
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
			const argResults = expr.args.map(arg => typeExpression(arg, resultState));
			for (const argResult of argResults) {
				resultState = argResult.state;
			}
			const argTypes = argResults.map(result => result.type);

			// Apply normal function application logic (copied from main path)
			if (argTypes.length > funcType.params.length) {
				throwTypeError(
					location => ({
						type: 'TypeError' as const,
						kind: 'general',
						message: `Too many arguments provided to trait function`,
						location,
					}),
					{
						line: expr.location?.start.line || 1,
						column: expr.location?.start.column || 1,
					}
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
					{
						line: expr.location?.start.line || 1,
						column: expr.location?.start.column || 1,
					},
					unificationContext
				);
			}

			// Return the function's return type with effects
			const resultType = substitute(funcType.return, resultState.substitution);

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
				{
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				}
			);
		}
	} else if (resolution.found === false) {
		// No trait implementation found - check if this is polymorphic
		const funcName = expr.func.kind === 'variable' ? expr.func.name : 'unknown';

		// Check if the trait function return type has unresolved type variables
		const hasUnresolvedVariables = hasTypeVariables(traitFuncType.return);

		if (!hasUnresolvedVariables && isFullyConcrete(argTypes[0])) {
			// Concrete function with concrete argument: error
			const argTypeNames = argTypes.map(t => getTypeName(t)).filter(Boolean);
			const typeStr =
				argTypeNames.length > 0 ? argTypeNames.join(', ') : 'unknown type';
			throwTypeError(
				location => ({
					type: 'TypeError' as const,
					kind: 'general',
					message: `No implementation of trait function '${funcName}' for ${typeStr}`,
					location,
				}),
				{
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				}
			);
		}
		// Otherwise, allow constraint to be created (polymorphic or type variable arguments)
	}
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
