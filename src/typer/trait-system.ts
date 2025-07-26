// NEW MINIMAL TRAIT SYSTEM
// Designed to make `map increment (Some 1)` work with simple dispatch

import { Type, Expression, FunctionExpression, ConstraintExpr } from '../ast';
import { TypeState } from './types';

// Simple trait definition - just a name and function signatures
export type TraitDefinition = {
	name: string;
	typeParam: string; // Usually 'a' or 'f'
	functions: Map<string, Type>; // function name -> function type
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
		throw new Error(`Duplicate implementation of ${traitName} for ${impl.typeName}`);
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
			throw new Error(`Function '${functionName}' not defined in trait ${traitName}`);
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

// Try to resolve a trait function call
export function resolveTraitFunction(
	registry: TraitRegistry,
	functionName: string,
	argTypes: Type[]
): { found: boolean; traitName?: string; typeName?: string; impl?: Expression } {
	// For now, just look at the first argument type
	if (argTypes.length === 0) {
		return { found: false };
	}

	const firstArgTypeName = getTypeName(argTypes[0]);
	if (!firstArgTypeName) {
		return { found: false };
	}

	// Find all traits that define this function and have implementations for this type
	const candidateImplementations: Array<{
		traitName: string;
		impl: Expression;
	}> = [];

	// Search through all traits to find implementations
	for (const [traitName, traitDef] of registry.definitions) {
		if (traitDef.functions.has(functionName)) {
			// Check if we have an implementation for this type
			const traitImpls = registry.implementations.get(traitName);
			if (traitImpls) {
				const impl = traitImpls.get(firstArgTypeName);
				if (impl && impl.functions.has(functionName)) {
					candidateImplementations.push({
						traitName,
						impl: impl.functions.get(functionName)!,
					});
				}
			}
		}
	}

	// Check for ambiguity - multiple traits providing implementations for the same type
	if (candidateImplementations.length > 1) {
		const traitNames = candidateImplementations.map(c => c.traitName);
		throw new Error(
			`Ambiguous function call '${functionName}' for type '${firstArgTypeName}': ` +
			`multiple implementations found in traits: ${traitNames.join(', ')}. ` +
			`Cannot determine which implementation to use.`
		);
	}

	if (candidateImplementations.length === 1) {
		const candidate = candidateImplementations[0];
		return {
			found: true,
			traitName: candidate.traitName,
			typeName: firstArgTypeName,
			impl: candidate.impl,
		};
	}

	return { found: false };
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
	return {
		traitName,
		functionType: traitDef.functions.get(functionName)!,
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