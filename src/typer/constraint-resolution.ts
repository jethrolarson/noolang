import {
	type Type,
	type Constraint,
	type RecordType,
	implementsConstraint,
} from '../ast';
import { type TypeState } from './types';
import { substitute } from './substitute';
import type { RecordStructure, StructureFieldType } from '../ast';

// Helper function to resolve nested structure constraints recursively
export function resolveNestedStructure(
	actualRecord: Type & { kind: 'record' },
	nestedStructure: RecordStructure,
	currentSubstitution: Map<string, Type>
): Map<string, Type> | null {
	const result = new Map(currentSubstitution);

	// Resolve each field in the nested structure
	for (const [fieldName, fieldType] of Object.entries(nestedStructure.fields)) {
		const normalizedFieldName = fieldName.startsWith('@')
			? fieldName.slice(1)
			: fieldName;

		if (!(normalizedFieldName in actualRecord.fields)) {
			// Required field not found
			return null;
		}

		const actualFieldType = actualRecord.fields[normalizedFieldName];

		if (fieldType.kind === 'variable') {
			// Simple field - substitute the variable with the actual field type
			result.set(fieldType.name, actualFieldType);
		} else if (fieldType.kind === 'nested') {
			// Nested structure - recurse
			if (actualFieldType.kind === 'record') {
				const nestedResult = resolveNestedStructure(
					actualFieldType,
					fieldType.structure,
					result
				);
				if (!nestedResult) {
					return null; // Nested resolution failed
				}
				// Merge nested results
				for (const [varName, varType] of nestedResult.entries()) {
					result.set(varName, varType);
				}
			} else {
				// Expected nested record but got something else
				return null;
			}
		}
	}

	return result;
}

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
				// Apply substitution to get the actual type
				const substitutedArgType = substitute(argType, state.substitution);
				const argTypeName = getTypeName(substitutedArgType);

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
						hasImplementation =
							!!argTypeName && !!traitImpls && traitImpls.has(argTypeName);
					}
				}

				if (hasImplementation) {
					// This argument type satisfies the constraint!
					// Create a substitution and apply it to the return type
					const substitution = new Map(state.substitution);

									if (argType.kind === 'list') {
					// For List types, substitute the type constructor variable with List variant
					substitution.set(varName, {
						kind: 'variant',
						name: 'List',
						args: [], // Empty args since this is just the constructor
					});
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
				// Handle different container types that might contain records
				let actualRecordType: RecordType | null = null;

				if (argType.kind === 'record') {
					actualRecordType = argType;
				} else if (argType.kind === 'variable') {
					// Check if this type variable has constraints that tell us it should be a record
					// For now, we'll try to see if it's already been substituted to a record
					const substitutedType = substitute(argType, state.substitution);
					if (substitutedType.kind === 'record') {
						actualRecordType = substitutedType;
					}
				} else if (argType.kind === 'list') {
					// For list types, check if the element type is a record
					const elementType = argType.element;
					if (elementType.kind === 'record') {
						actualRecordType = elementType;
					} else if (elementType.kind === 'variable') {
						const substitutedElement = substitute(
							elementType,
							state.substitution
						);
						if (substitutedElement.kind === 'record') {
							actualRecordType = substitutedElement;
						}
					}
				} else if (argType.kind === 'variant') {
					// For functor types like Maybe a, Option a, etc., check the first type argument
					if (argType.args.length > 0) {
						const elementType = argType.args[0];
						if (elementType.kind === 'record') {
							actualRecordType = elementType;
						} else if (elementType.kind === 'variable') {
							const substitutedElement = substitute(
								elementType,
								state.substitution
							);
							if (substitutedElement.kind === 'record') {
								actualRecordType = substitutedElement;
							}
						}
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
							} else if (
								actualFieldType &&
								constraintFieldType.kind === 'nested'
							) {
								// Handle nested structure constraints
								const nestedStructure = constraintFieldType.structure;
								if (actualFieldType.kind === 'record') {
									// Resolve nested field access recursively
									const nestedResult = resolveNestedStructure(
										actualFieldType,
										nestedStructure,
										substitution
									);
									if (nestedResult) {
										// Apply any additional substitutions from nested resolution
										for (const [varName, varType] of nestedResult.entries()) {
											substitution.set(varName, varType);
										}
									}
								}
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
							// Handle both simple and nested field constraints
							function findResultVariable(
								fields: Record<string, StructureFieldType>
							): Type | null {
								for (const [_fieldName, fieldType] of Object.entries(fields)) {
									if (
										fieldType.kind === 'variable' &&
										substitution.has(fieldType.name)
									) {
										// Found a direct variable that was substituted
										return substitution.get(fieldType.name)!;
									} else if (fieldType.kind === 'nested') {
										// Recursively search nested structure
										const nestedResult = findResultVariable(
											fieldType.structure.fields
										);
										if (nestedResult) return nestedResult;
									}
								}
								return null;
							}

							const resultType = findResultVariable(requiredStructure.fields);
							if (resultType) {
								substitution.set(resolvedType.name, resultType);
								resolvedType = resultType;
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

// Helper function to extract constraints from function types
export function extractFunctionConstraints(funcType: Type): {
	actualFuncType: Type;
	functionConstraints: Constraint[] | undefined;
} {
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

	return { actualFuncType, functionConstraints };
}

// Helper function to get type name for constraint resolution
function getTypeName(type: Type): string | null {
	if (type.kind === 'primitive') return type.name;
	if (type.kind === 'variant') return type.name;
	if (type.kind === 'list') return 'List';
	if (type.kind === 'unit') return 'Unit';
	return null;
}
