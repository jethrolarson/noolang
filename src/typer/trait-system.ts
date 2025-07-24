// NEW MINIMAL TRAIT SYSTEM
// Designed to make `map increment (Some 1)` work with simple dispatch

import { Type, Expression } from '../ast';
import { TypeState } from './types';

// Simple trait definition - just a name and function signatures
export type TraitDefinition = {
	name: string;
	typeParam: string; // Usually 'a' or 'f'
	functions: Map<string, Type>; // function name -> function type
};

// Simple trait implementation - concrete functions for a specific type
export type TraitImplementation = {
	typeName: string; // e.g., "Option", "List", "Int"
	functions: Map<string, Expression>; // function name -> implementation expression
};

// Registry holding all traits and their implementations
export type TraitRegistry = {
	definitions: Map<string, TraitDefinition>;
	implementations: Map<string, Map<string, TraitImplementation>>; // trait -> type -> impl
};

// Create empty trait registry
export function createTraitRegistry(): TraitRegistry {
	return {
		definitions: new Map(),
		implementations: new Map(),
	};
}

// Add a trait definition
export function addTraitDefinition(
	registry: TraitRegistry,
	trait: TraitDefinition
): void {
	registry.definitions.set(trait.name, trait);
	if (!registry.implementations.has(trait.name)) {
		registry.implementations.set(trait.name, new Map());
	}
}

// Add a trait implementation
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

	// Search through all traits to find one that has this function
	for (const [traitName, traitDef] of registry.definitions) {
		if (traitDef.functions.has(functionName)) {
			// Check if we have an implementation for this type
			const traitImpls = registry.implementations.get(traitName);
			if (traitImpls) {
				const impl = traitImpls.get(firstArgTypeName);
				if (impl && impl.functions.has(functionName)) {
					return {
						found: true,
						traitName,
						typeName: firstArgTypeName,
						impl: impl.functions.get(functionName)!,
					};
				}
			}
		}
	}

	return { found: false };
}

// Check if a function name is defined in any trait
export function isTraitFunction(
	registry: TraitRegistry,
	functionName: string
): boolean {
	for (const traitDef of registry.definitions.values()) {
		if (traitDef.functions.has(functionName)) {
			return true;
		}
	}
	return false;
}

// Get trait definition and function type for a trait function
// Returns the most recently defined trait that has this function
export function getTraitFunctionInfo(
	registry: TraitRegistry,
	functionName: string
): { traitName: string; functionType: Type; typeParam: string } | null {
	let lastMatch: { traitName: string; functionType: Type; typeParam: string } | null = null;
	
	for (const [traitName, traitDef] of registry.definitions) {
		if (traitDef.functions.has(functionName)) {
			lastMatch = {
				traitName,
				functionType: traitDef.functions.get(functionName)!,
				typeParam: traitDef.typeParam,
			};
		}
	}
	return lastMatch;
}

// Add trait registry to TypeState
export function addTraitRegistryToState(state: TypeState): TypeState {
	return {
		...state,
		traitRegistry: createTraitRegistry(),
	};
}