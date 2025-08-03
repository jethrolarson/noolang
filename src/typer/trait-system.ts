// NEW MINIMAL TRAIT SYSTEM
// Designed to make `map increment (Some 1)` work with simple dispatch

import {
	Type,
	Expression,
	FunctionExpression,
	ConstraintExpr,
	FunctionType,
} from '../ast';
import { TypeState } from './types';

// Simple trait definition - just a name and function signatures
export type TraitDefinition = {
	name: string;
	typeParam: string; // Usually 'a' or 'f'
	functions: Map<string, FunctionType>; // function name -> function type
};

// Simple trait implementation - concrete functions for a specific type
export type TraitImplementation = {
	typeName: string; // e.g., "Option", "List", "Float"
	functions: Map<string, Expression>; // function name -> implementation expression
	givenConstraints?: ConstraintExpr; // Optional given constraints for conditional implementations
};

// Registry holding all traits and their implementations
export type TraitRegistry = {
	definitions: Map<string, TraitDefinition>;
	implementations: Map<string, Map<string, TraitImplementation>>; // trait -> type -> impl
	// Track which traits define each function name for conflict detection
	functionTraits: Map<string, string[]>; // function name -> trait names that define it
};

// Helper function to count parameters in a function expression
function countExpressionParams(expr: Expression): number {
	if (expr.kind === 'function') {
		return (expr as FunctionExpression).params.length;
	}
	// For non-function expressions (like variables), we can't determine arity
	// Return -1 to indicate unknown arity (this will be handled in validation)
	return -1;
}

// Helper function to count parameters in a function type (handles curried types)
function countTypeParams(type: Type): number {
	if (type.kind !== 'function') return 0;
	// Count current parameters plus any parameters in the return type (for curried functions)
	return type.params.length + countTypeParams(type.return);
}

// Create empty trait registry
export function createTraitRegistry(): TraitRegistry {
	return {
		definitions: new Map(),
		implementations: new Map(),
		functionTraits: new Map(),
	};
}

// Add a trait definition
export function addTraitDefinition(
	registry: TraitRegistry,
	trait: TraitDefinition
): void {
	// Add the trait definition
	registry.definitions.set(trait.name, trait);
	if (!registry.implementations.has(trait.name)) {
		registry.implementations.set(trait.name, new Map());
	}

	// Track function names for this trait (allow multiple traits to define same function)
	for (const functionName of trait.functions.keys()) {
		const existingTraits = registry.functionTraits.get(functionName) || [];
		if (!existingTraits.includes(trait.name)) {
			existingTraits.push(trait.name);
			registry.functionTraits.set(functionName, existingTraits);
		}
	}
}

// Add a trait implementation with signature validation
export function addTraitImplementation(
	registry: TraitRegistry,
	traitName: string,
	impl: TraitImplementation
): boolean {
	const traitImpls = registry.implementations.get(traitName);
	if (!traitImpls) {
		return false; // Trait not found
	}

	// Check for duplicate implementation
	if (traitImpls.has(impl.typeName)) {
		throw new Error(
			`Duplicate implementation of ${traitName} for ${impl.typeName}`
		);
	}

	// Get the trait definition for signature validation
	const traitDef = registry.definitions.get(traitName);
	if (!traitDef) {
		throw new Error(`Trait definition not found for ${traitName}`);
	}

	// Validate each function signature matches the constraint definition
	for (const [functionName, implExpr] of impl.functions.entries()) {
		const expectedType = traitDef.functions.get(functionName);
		if (!expectedType) {
			throw new Error(
				`Function '${functionName}' not defined in trait ${traitName}`
			);
		}

		// Count parameters in expected type vs implementation
		const expectedParamCount = countTypeParams(expectedType);
		const actualParamCount = countExpressionParams(implExpr);

		// Only validate arity for function expressions (actualParamCount >= 0)
		// For variable references and other expressions, we can't determine arity at this stage
		if (actualParamCount >= 0 && actualParamCount !== expectedParamCount) {
			throw new Error(
				`Function signature mismatch for '${functionName}' in ${traitName} implementation for ${impl.typeName}: ` +
					`expected ${expectedParamCount} parameters, got ${actualParamCount}`
			);
		}
	}

	// TODO: Validate given constraints are satisfied
	// For now, just store the implementation with its given constraints
	traitImpls.set(impl.typeName, impl);
	return true;
}

// Get the concrete type name for trait lookup
export function getTypeName(type: Type): string {
	switch (type.kind) {
		case 'primitive':
			return type.name;
		case 'variant':
			return type.name; // For ADTs like Option, Result
		case 'list':
			return 'List';
		case 'function':
			return 'function';
		case 'variable':
			return type.name;
		case 'record':
			return 'record';
		case 'tuple':
			return 'tuple';
		case 'constrained':
			// For constrained types, get the name from the base type
			return getTypeName(type.baseType);
		default:
			// For any other types, use the kind as the name
			return type.kind;
	}
}

export function resolveTraitFunction(
	registry: TraitRegistry,
	functionName: string,
	argTypes: Type[]
): {
	found: boolean;
	traitName?: string;
	typeName?: string;
	impl?: Expression;
	needsConstraint?: boolean;
} {
	if (argTypes.length === 0) {
		return { found: false };
	}

	// Get the trait that defines this function
	const definingTraits = registry.functionTraits.get(functionName) || [];
	if (definingTraits.length === 0) {
		return { found: false };
	}

	// For now, use the first trait that defines this function
	// TODO: Handle ambiguous cases where multiple traits define the same function
	const traitName = definingTraits[0];
	const traitDef = registry.definitions.get(traitName);
	if (!traitDef) {
		return { found: false };
	}

	const functionType = traitDef.functions.get(functionName);
	if (!functionType || functionType.kind !== 'function') {
		return { found: false };
	}

	// Try to find a concrete implementation by examining all argument types
	// Look for any argument that has a concrete type we can dispatch on
	const candidateImplementations: Array<{
		traitName: string;
		typeName: string;
		impl: Expression;
	}> = [];

	// Check each argument type to see if we can find a concrete implementation
	for (const argType of argTypes) {
		const typeName = getTypeName(argType);
		if (typeName && typeName !== 'variable') {
			// Check ALL traits that define this function for implementations for this type
			for (const candidateTraitName of definingTraits) {
				const traitImpls = registry.implementations.get(candidateTraitName);
				if (traitImpls) {
					const impl = traitImpls.get(typeName);
					if (impl && impl.functions.has(functionName)) {
						candidateImplementations.push({
							traitName: candidateTraitName,
							typeName,
							impl: impl.functions.get(functionName)!,
						});
					}
				}
			}
		}
	}

	// Remove duplicates (same implementation found via different arguments)
	const uniqueImplementations = candidateImplementations.filter(
		(impl, index, array) =>
			array.findIndex(
				other =>
					other.traitName === impl.traitName && other.typeName === impl.typeName
			) === index
	);

	// Check for ambiguity - multiple different implementations
	if (uniqueImplementations.length > 1) {
		const typeNames = uniqueImplementations.map(c => c.typeName);
		throw new Error(
			`Ambiguous function call '${functionName}': ` +
				`multiple implementations found for types: ${typeNames.join(', ')}. ` +
				`Cannot determine which implementation to use.`
		);
	}

	if (uniqueImplementations.length === 1) {
		const candidate = uniqueImplementations[0];
		return {
			found: true,
			traitName: candidate.traitName,
			typeName: candidate.typeName,
			impl: candidate.impl,
		};
	}

	// No concrete implementation found - check if we should error or create constraint
	// For functions where the trait type parameter is in the return type (like pure: a -> m a),
	// we can't dispatch on arguments, so always create constrained type
	const traitTypeParam = traitDef.typeParam;
	
	// Helper to check if a type contains the trait type parameter
	const containsTypeParameter = (type: Type, paramName: string): boolean => {
		switch (type.kind) {
			case 'variable':
				return type.name === paramName;
			case 'variant':
				return type.name === paramName || type.args.some(arg => containsTypeParameter(arg, paramName));
			case 'function':
				return type.params.some(param => containsTypeParameter(param, paramName)) ||
					   containsTypeParameter(type.return, paramName);
			case 'list':
				return containsTypeParameter(type.element, paramName);
			default:
				return false;
		}
	};
	
	// Check if trait type parameter is only in return type
	const paramHasTraitType = functionType.params.some(param => containsTypeParameter(param, traitTypeParam));
	const returnHasTraitType = containsTypeParameter(functionType.return, traitTypeParam);
	
	if (!paramHasTraitType && returnHasTraitType) {
		// Trait type parameter only in return type (like pure) - always create constraint
		return {
			found: false,
			needsConstraint: true,
			traitName: definingTraits[0],
		};
	}
	
	// For functions where trait type parameter is in arguments, check for concrete types
	const hasConcreteArgs = argTypes.some(argType => {
		const typeName = getTypeName(argType);
		return typeName && typeName !== 'variable' && argType.kind !== 'variable';
	});
	
	if (hasConcreteArgs) {
		// Concrete types with no implementation should error
		return { found: false };
	}
	
	// Type variables/polymorphic cases should create constrained type
	return {
		found: false,
		needsConstraint: true,
		traitName: definingTraits[0], // Use first defining trait for constraint creation
	};
}

// Check if a function name is defined in any trait
export function isTraitFunction(
	registry: TraitRegistry,
	functionName: string
): boolean {
	return registry.functionTraits.has(functionName);
}

// Get trait definition and function type for a trait function
// For ambiguous cases, returns the first trait found (maintain backward compatibility)
export function getTraitFunctionInfo(
	registry: TraitRegistry,
	functionName: string
): { traitName: string; functionType: Type; typeParam: string } | null {
	const definingTraits = registry.functionTraits.get(functionName) || [];

	if (definingTraits.length === 0) {
		return null;
	}

	// For type inference purposes, we can use any trait that defines this function
	// The ambiguity will be detected later during function resolution if multiple implementations exist
	const traitName = definingTraits[0];
	const traitDef = registry.definitions.get(traitName)!;
	const rawFunctionType = traitDef.functions.get(functionName)!;

	// Find the actual variable name that corresponds to the trait parameter
	// The trait parameter (e.g., 'f' for Functor) appears as a variant type in the function
	let actualTypeVar = traitDef.typeParam; // fallback
	if (
		rawFunctionType.kind === 'function' &&
		rawFunctionType.params.length > 0
	) {
		const firstParam = rawFunctionType.params[0];
		if (
			firstParam.kind === 'variant' &&
			firstParam.name === traitDef.typeParam
		) {
			// This is the trait parameter, use its name
			actualTypeVar = firstParam.name;
		}
	}

	// Attach the trait constraint to the function type
	const functionTypeWithConstraints = {
		...(rawFunctionType as FunctionType),
		constraints: [
			{
				kind: 'implements' as const,
				typeVar: actualTypeVar,
				interfaceName: traitName,
			},
		],
	};

	return {
		traitName,
		functionType: functionTypeWithConstraints,
		typeParam: traitDef.typeParam,
	};
}

// Add trait registry to TypeState
export function addTraitRegistryToState(state: TypeState): TypeState {
	return {
		...state,
		traitRegistry: createTraitRegistry(),
	};
}