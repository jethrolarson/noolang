// Constraint function resolution for trait system
import {
	Type,
	Expression,
	VariableExpression,
	ApplicationExpression,
	typeVariable,
	functionType,
} from '../ast';
import {
	TypeState,
	TypeResult,
	TypeScheme,
	resolveConstraintFunction,
	createPureTypeResult,
	createTypeResult,
} from './types';
import { substitute } from './substitute';
import { typeToString } from './helpers';

/**
 * Check if a function call might be a constraint function and resolve it
 */
export function tryResolveConstraintFunction(
	functionName: string,
	args: Expression[],
	argTypes: Type[],
	state: TypeState
): { resolved: boolean; specializedName?: string; typeScheme?: TypeScheme } {
	// Search through all constraints to see if this function name exists
	for (const [constraintName, constraintInfo] of state.constraintRegistry) {
		if (constraintInfo.signature.functions.has(functionName)) {
			// This is potentially a constraint function call

			// Try to resolve based on the first argument's type (common pattern)
			if (argTypes.length > 0) {
				const firstArgType = substitute(argTypes[0], state.substitution);

				// Only resolve if we have a concrete type (not a type variable)
				if (firstArgType.kind !== 'variable') {
					const implementation = resolveConstraintFunction(
						state.constraintRegistry,
						constraintName,
						functionName,
						firstArgType
					);

					if (implementation) {
						// Generate specialized function name
						const typeName = typeToString(firstArgType);
						const specializedName = `__${constraintName}_${functionName}_${typeName}`;

						return {
							resolved: true,
							specializedName,
							typeScheme: implementation,
						};
					}
				}
			}
		}
	}

	return { resolved: false };
}

/**
 * Decorate the environment with specialized constraint functions
 */
export function decorateEnvironmentWithConstraintFunctions(
	state: TypeState
): TypeState {
	const newEnvironment = new Map(state.environment);

	// Add all available constraint implementations to the environment
	for (const [constraintName, constraintInfo] of state.constraintRegistry) {
		for (const [functionName, functionType] of constraintInfo.signature
			.functions) {
			for (const [typeName, implementation] of constraintInfo.implementations) {
				const specializedName = `__${constraintName}_${functionName}_${typeName}`;

				// Add the specialized function to the environment
				for (const [implName, implScheme] of implementation.functions) {
					if (implName === functionName) {
						newEnvironment.set(specializedName, implScheme);
					}
				}
			}
		}
	}

	return {
		...state,
		environment: newEnvironment,
	};
}

/**
 * Check if a variable reference is a constraint function and needs resolution
 */
export function resolveConstraintVariable(
	name: string,
	state: TypeState
): {
	resolved: boolean;
	needsResolution?: boolean;
	constraintName?: string;
	functionName?: string;
} {
	// Check if this is a constraint function name
	for (const [constraintName, constraintInfo] of state.constraintRegistry) {
		if (constraintInfo.signature.functions.has(name)) {
			return {
				resolved: true,
				needsResolution: true,
				constraintName,
				functionName: name,
			};
		}
	}

	return { resolved: false };
}

/**
 * Create a constraint function type that includes information about needed resolution
 */
export function createConstraintFunctionType(
	constraintName: string,
	functionName: string,
	state: TypeState
): Type {
	const constraintInfo = state.constraintRegistry.get(constraintName);
	if (!constraintInfo) {
		throw new Error(`Constraint '${constraintName}' not found`);
	}

	const functionType = constraintInfo.signature.functions.get(functionName);
	if (!functionType) {
		throw new Error(
			`Function '${functionName}' not found in constraint '${constraintName}'`
		);
	}

	// Return the function type with constraint information
	// We'll handle the actual resolution during application
	return functionType;
}

/**
 * Generate constraint qualification error when resolution fails
 */
export function generateConstraintError(
	constraintName: string,
	functionName: string,
	attemptedType: Type,
	state: TypeState
): string {
	const typeName = typeToString(attemptedType);
	const availableImpls =
		state.constraintRegistry.get(constraintName)?.implementations;
	const availableTypes = availableImpls
		? Array.from(availableImpls.keys())
		: [];

	let message = `No implementation of constraint '${constraintName}' found for type '${typeName}' when calling '${functionName}'.`;

	if (availableTypes.length > 0) {
		message += `\nAvailable implementations: ${availableTypes.join(', ')}`;
	} else {
		message += `\nNo implementations of '${constraintName}' have been defined.`;
	}

	message += `\n\nTo fix this, add an implementation:\nimplement ${constraintName} ${typeName} (\n  ${functionName} = ...\n);`;

	return message;
}
