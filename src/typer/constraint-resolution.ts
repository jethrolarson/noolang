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
	// Accumulate substitutions across ALL constraints before substituting the
	// return type. A single application can carry several constraints (e.g.
	// `map @name` has both `f implements Functor` and `b has {@name c}`);
	// resolving only the first and returning early left the field type variable
	// unbound, so `map @name [{@name "bob"}]` inferred `List a` instead of
	// `List String`.
	const mergedSubstitution = new Map(state.substitution);
	let resolvedAny = false;

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

					// Accumulate this constraint's substitution and move on to the
					// next constraint (do not substitute the return type yet).
					for (const [k, v] of substitution) mergedSubstitution.set(k, v);
					resolvedAny = true;
					break;
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
					const substitution = new Map(mergedSubstitution);

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
						// The field variables bound above are the whole result: the
						// return type is substituted once, from mergedSubstitution, after
						// every constraint has contributed.
						//
						// There used to be a SPECIAL CASE here that, when the return type
						// was still an unbound variable, bound it to the FIRST field
						// variable it could find in the constraint's structure. For an
						// accessor whose constraint names exactly one field that happened
						// to be right; for anything else it silently picked the wrong
						// field. That is what made `fn p => getCity (getAddress p)` report
						// the address record where the city String belonged. Composition
						// (constraint-composition.ts) plus the lift guard in
						// buildNormalFunctionType now keep the leaf variable genuinely
						// linked to the return type, so guessing is neither needed nor
						// safe.

						// Accumulate this constraint's substitution and continue.
						for (const [k, v] of substitution) mergedSubstitution.set(k, v);
						resolvedAny = true;
						break;
					}
				}
			}
		}
	}

	if (resolvedAny) {
		const resolvedType = substitute(returnType, mergedSubstitution);
		return {
			resolvedType,
			updatedState: { ...state, substitution: mergedSubstitution },
		};
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
