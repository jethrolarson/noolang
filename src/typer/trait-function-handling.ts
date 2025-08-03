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
import { tryResolveConstraints } from './constraint-resolution';
import { freshenTypeVariables, freshTypeVariable } from './type-operations';

// Helper function to handle trait function resolution
export function handleTraitFunctionApplication(
	expr: ApplicationExpression,
	funcType: Type,
	argTypes: Type[],
	currentState: TypeState,
	funcResult: TypeResult
): TypeResult | null {
	// Check if this could be a trait function call
	// Only call trait function application for the inner application (when func is a variable)
	// NOT for the outer application (when func is an application)
	let traitFunctionName: string | null = null;

	if (expr.func.kind === 'variable') {
		// This is the inner application - check if it's a trait function
		if (isTraitFunction(currentState.traitRegistry, expr.func.name)) {
			traitFunctionName = expr.func.name;
		}
	}
	// Don't call trait function application for outer applications (when func is an application)
	// The outer application should resolve the constrained type returned by the inner application

	if (
		traitFunctionName &&
		isTraitFunction(currentState.traitRegistry, traitFunctionName)
	) {
		// Get the trait function signature to understand its arity
		const traitInfo = getTraitFunctionInfo(
			currentState.traitRegistry,
			traitFunctionName
		);
		if (traitInfo && traitInfo.functionType.kind === 'function') {
			const traitFuncType = traitInfo.functionType;

			// For trait functions, we need to check if we have enough arguments to fully apply the function
			// For curried functions like `add : a -> a -> a`, we need to check if the return type is still a function
			// after applying the arguments
			let isFullyApplied = false;
			let currentFuncType = traitFuncType;
			let remainingArgs = argTypes.length;

			// Recursively check if we have enough arguments to fully apply the function
			while (remainingArgs > 0 && currentFuncType.kind === 'function') {
				if (currentFuncType.params.length === 0) {
					break;
				}
				remainingArgs--;
				currentFuncType = currentFuncType.return as FunctionType;
			}

			// If we've applied all arguments and the result is not a function, it's fully applied
			isFullyApplied =
				remainingArgs === 0 && currentFuncType.kind !== 'function';

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
	// Freshen type variables in the trait function type to avoid conflicts with argument types
	// Create a mapping from old variable names to fresh ones
	const mapping = new Map<string, Type>();
	const freeVars = new Set<string>();

	// Collect all free type variables in the trait function type
	const collectVars = (type: Type) => {
		if (type.kind === 'variable') {
			freeVars.add(type.name);
		} else if (type.kind === 'function') {
			type.params.forEach(collectVars);
			collectVars(type.return);
		}
	};
	collectVars(traitFuncType);

	// Create fresh variables for each free variable
	let freshState = currentState;
	for (const varName of freeVars) {
		const [freshVar, newState] = freshTypeVariable(freshState);
		mapping.set(varName, freshVar);
		freshState = newState;
	}

	const [freshenedTraitFuncType, freshenedState] = freshenTypeVariables(
		traitFuncType,
		mapping,
		freshState
	);

	// Ensure the freshened type is still a function type
	if (freshenedTraitFuncType.kind !== 'function') {
		throw new Error(
			'Expected function type after freshening trait function type'
		);
	}

	// Partial application: return a function type with remaining parameters and constraints
	// Unify the supplied arguments with the corresponding parameters
	let partialState = freshenedState;
	for (let i = 0; i < argTypes.length; i++) {
		// Pass constraint context to unification
		const unificationContext = {
			reason: 'trait_function_application' as const,
			operation: `unifying argument ${i + 1}`,
			hint: `Argument ${i + 1} has type ${typeToString(
				argTypes[i],
				partialState.substitution
			)} but the trait function parameter expects ${typeToString(
				freshenedTraitFuncType.params[i],
				partialState.substitution
			)}.`,
			constraintContext: freshenedTraitFuncType.constraints || [],
		};

		partialState = unify(
			freshenedTraitFuncType.params[i],
			argTypes[i],
			partialState,
			{
				line: expr.location?.start.line || 1,
				column: expr.location?.start.column || 1,
			},
			unificationContext
		);
	}

	// Build the remaining curried function type
	// For curried functions, we need to handle the case where we've applied one argument
	// and the return type is still a function
	const resultType = substitute(
		freshenedTraitFuncType.return,
		partialState.substitution
	);
	let curriedType: Type = resultType;
	// Collect constraints from both the trait function and the argument types
	const allConstraints: Constraint[] = [];

	// Add trait function constraints (e.g., f implements Functor)
	if (
		freshenedTraitFuncType.constraints &&
		freshenedTraitFuncType.constraints.length > 0
	) {
		const substitutedConstraints = freshenedTraitFuncType.constraints.map(
			constraint => {
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
			}
		);
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
		// Try to resolve constraints using the argument types
		const substitutedArgTypes = argTypes.map(argType =>
			substitute(argType, partialState.substitution)
		);

		const constraintResult = tryResolveConstraints(
			resultType,
			allConstraints,
			substitutedArgTypes,
			partialState
		);

		if (constraintResult) {
			// Constraints were successfully resolved to a concrete type
			curriedType = constraintResult.resolvedType;
			partialState = constraintResult.updatedState;
		} else {
			// Could not resolve constraints, preserve them on the return type
			curriedType = {
				...resultType,
				constraints: (resultType.constraints || []).concat(allConstraints),
			};
		}
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
	let funcName = 'unknown';
	if (expr.func.kind === 'variable') {
		funcName = expr.func.name;
	} else if (expr.func.kind === 'application') {
		// For nested applications, try to extract the function name from the inner application
		// This handles cases like (map (fn x => x + 1)) [1, 2, 3]
		if (expr.func.func.kind === 'variable') {
			funcName = expr.func.func.name;
		}
	}
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

			// Freshen type variables in the trait implementation type to avoid conflicts
			// Create a mapping from old variable names to fresh ones
			const mapping = new Map<string, Type>();
			const freeVars = new Set<string>();

			// Collect all free type variables in the trait implementation type
			const collectVars = (type: Type) => {
				if (type.kind === 'variable') {
					freeVars.add(type.name);
				} else if (type.kind === 'function') {
					type.params.forEach(collectVars);
					collectVars(type.return);
				}
			};
			collectVars(funcType);

			// Create fresh variables for each free variable
			let freshState = resultState;
			for (const varName of freeVars) {
				const [freshVar, newState] = freshTypeVariable(freshState);
				mapping.set(varName, freshVar);
				freshState = newState;
			}

			const [freshenedFuncType, freshenedState] = freshenTypeVariables(
				funcType,
				mapping,
				freshState
			);
			resultState = freshenedState;

			// Ensure the freshened type is still a function type
			if (freshenedFuncType.kind !== 'function') {
				throw new Error(
					'Expected function type after freshening trait implementation type'
				);
			}

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
						freshenedFuncType.params[i],
						resultState.substitution
					)}.`,
				};

				resultState = unify(
					freshenedFuncType.params[i],
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
			let resultType = substitute(
				freshenedFuncType.return,
				resultState.substitution
			);

			// Substitute the trait type parameter with the concrete type (e.g., f -> List)
			const traitDef = currentState.traitRegistry.definitions.get(
				resolution.traitName!
			);
			if (traitDef) {
				const traitTypeSubstitution = new Map();
				traitTypeSubstitution.set(traitDef.typeParam, {
					kind: 'variant',
					name: resolution.typeName!,
					args: [],
				});
				resultType = substitute(resultType, traitTypeSubstitution);
				// Normalize List variant to canonical list type
				resultType = normalizeListType(resultType);
			}

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
		let funcName = 'unknown';
		if (expr.func.kind === 'variable') {
			funcName = expr.func.name;
		} else if (expr.func.kind === 'application') {
			// For nested applications, try to extract the function name from the inner application
			if (expr.func.func.kind === 'variable') {
				funcName = expr.func.func.name;
			}
		}

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

// Helper to normalize List variant to canonical list type
function normalizeListType(type: Type): Type {
	if (
		type &&
		type.kind === 'variant' &&
		type.name === 'List' &&
		type.args.length === 1
	) {
		return { kind: 'list', element: normalizeListType(type.args[0]) };
	}
	if (type && type.kind === 'function') {
		return {
			...type,
			params: type.params.map(normalizeListType),
			return: normalizeListType(type.return),
		};
	}
	if (type && type.kind === 'tuple') {
		return { ...type, elements: type.elements.map(normalizeListType) };
	}
	if (type && type.kind === 'record') {
		const newFields: Record<string, Type> = {};
		for (const k in type.fields)
			newFields[k] = normalizeListType(type.fields[k]);
		return { ...type, fields: newFields };
	}
	return type;
}
