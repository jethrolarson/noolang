import { Constraint, Type } from '../ast';
import { TypeState } from './types';
import { constraintsEqual, isTypeKind, typeToString } from './helpers';

// Built-in constraint types that Noolang supports
const BUILT_IN_CONSTRAINTS = new Set([
	'Collection',  // Lists and records (not primitive types like String, Int, Bool)
	'Number',      // Numeric types (Int)
	'String',      // String types
	'Boolean',     // Boolean types
	'Show',        // Types that can be converted to strings
	'List',        // List types specifically
	'Record',      // Record types specifically
	'Function',    // Function types
	'Eq',          // Types that support equality comparison
]);

// Validate that a constraint name is valid
export const validateConstraintName = (constraint: string): void => {
	if (!BUILT_IN_CONSTRAINTS.has(constraint)) {
		throw new Error(
			`Unknown constraint '${constraint}'. Built-in constraints are: ${Array.from(BUILT_IN_CONSTRAINTS).join(', ')}`
		);
	}
};

export const satisfiesConstraint = (
	type: Type,
	constraint: string
): boolean => {
	// Apply substitutions if needed - for now assume type is already resolved
	switch (constraint) {
		case 'Collection':
			// Lists and records (not primitive types like String, Int, Bool)
			return type.kind === 'list' || type.kind === 'record' || type.kind === 'tuple';
			
		case 'Number':
			// Numeric types (Int)
			return type.kind === 'primitive' && type.name === 'Int';
			
		case 'String':
			// String types
			return type.kind === 'primitive' && type.name === 'String';
			
		case 'Boolean':
			// Boolean types  
			return type.kind === 'primitive' && type.name === 'Bool';
			
		case 'Show':
			// Types that can be converted to strings - for now, all basic types can be shown
			return type.kind === 'primitive' || type.kind === 'list' || type.kind === 'record' || 
			       type.kind === 'tuple' || type.kind === 'variant';
			       
		case 'List':
			// List types specifically
			return type.kind === 'list';
			
		case 'Record':
			// Record types specifically
			return type.kind === 'record';
			
		case 'Function':
			// Function types
			return type.kind === 'function';
			
		case 'Eq':
			// Types that support equality comparison - most types except functions
			return type.kind !== 'function';
			
		default:
			// Unknown constraint
			return false;
	}
};

// Helper: Recursively push a constraint to all type variables inside a type
export function propagateConstraintToType(type: Type, constraint: Constraint) {
	switch (type.kind) {
		case 'variable':
			type.constraints = type.constraints || [];
			if (!type.constraints.some(c => constraintsEqual(c, constraint))) {
				type.constraints.push(constraint);
			}
			break;
		case 'function':
			for (const param of type.params) {
				propagateConstraintToType(param, constraint);
			}
			propagateConstraintToType(type.return, constraint);
			break;
		case 'list':
			propagateConstraintToType(type.element, constraint);
			break;
		case 'tuple':
			for (const el of type.elements) {
				propagateConstraintToType(el, constraint);
			}
			break;
		case 'record':
			for (const fieldType of Object.values(type.fields)) {
				propagateConstraintToType(fieldType, constraint);
			}
			break;
		case 'union':
			for (const t of type.types) {
				propagateConstraintToType(t, constraint);
			}
			break;
		// For primitives, unit, unknown: do nothing
	}
}

// Collect all constraints for a variable, following the substitution chain
export function collectAllConstraintsForVar(
	varName: string,
	substitution: Map<string, Type>
): Constraint[] {
	const seen = new Set<string>();
	let constraints: Constraint[] = [];
	let currentVarName = varName;
	let currentType = substitution.get(currentVarName);

	while (currentType && isTypeKind(currentType, 'variable')) {
		if (seen.has(currentVarName)) {
			break; // Prevent cycles
		}
		seen.add(currentVarName);

		if (currentType.constraints) {
			constraints = constraints.concat(currentType.constraints);
		}

		currentVarName = currentType.name;
		currentType = substitution.get(currentVarName);
	}

	// Also check the original variable
	const origType = substitution.get(varName);
	if (origType && isTypeKind(origType, 'variable') && origType.constraints) {
		constraints = constraints.concat(origType.constraints);
	}

	return constraints;
}

// After type inference, validate all constraints in the substitution map
export function validateAllSubstitutionConstraints(state: TypeState) {
	for (const [varName, concreteType] of state.substitution.entries()) {
		// Only check if the concreteType is not a variable
		if (concreteType.kind !== 'variable') {
			// Collect all constraints from the substitution chain
			const constraintsToCheck = collectAllConstraintsForVar(
				varName,
				state.substitution
			);
			for (const constraint of constraintsToCheck) {
				if (
					constraint.kind === 'hasField' &&
					isTypeKind(concreteType, 'record')
				) {
					if (!(constraint.field in concreteType.fields)) {
						throw new Error(
							`Record type missing required field '${constraint.field}'`
						);
					}
					// Optionally, unify field types here if needed
				} else if (constraint.kind === 'is') {
					if (!satisfiesConstraint(concreteType, constraint.constraint)) {
						throw new Error(
							`Type variable '${varName}' was unified to ${typeToString(
								concreteType
							)} but does not satisfy constraint '${
								constraint.constraint
							}'. This typically means a partial function is being used in an unsafe context. Consider using total functions that return Option or Result types instead of partial functions with constraints.`
						);
					}
				}
			}
		}
	}
}
