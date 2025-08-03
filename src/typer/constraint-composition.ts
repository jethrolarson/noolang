import type { HasStructureConstraint, StructureFieldType } from '../ast';

/**
 * Compose two structural constraints to create a nested constraint.
 *
 * Example:
 * innerConstraint: person has {address: α}
 * outerConstraint: address has {street: β}
 * Result: person has {address: {street: β}}
 */
export function composeStructuralConstraints(
	innerConstraint: HasStructureConstraint,
	outerConstraint: HasStructureConstraint,
	connectionVar: string // The variable that connects inner and outer (α in example)
): HasStructureConstraint {
	// Find the field in innerConstraint that matches connectionVar
	let connectingFieldName: string | null = null;

	for (const [fieldName, fieldType] of Object.entries(
		innerConstraint.structure.fields
	)) {
		if (fieldType.kind === 'variable' && fieldType.name === connectionVar) {
			connectingFieldName = fieldName;
			break;
		}
	}

	if (!connectingFieldName) {
		throw new Error(
			`Cannot compose constraints: connection variable ${connectionVar} not found in inner constraint`
		);
	}

	// Create the nested structure by replacing the connecting field with the outer constraint's structure
	const composedFields: { [fieldName: string]: StructureFieldType } = {};

	// Copy all fields from inner constraint
	for (const [fieldName, fieldType] of Object.entries(
		innerConstraint.structure.fields
	)) {
		if (fieldName === connectingFieldName) {
			// Replace this field with the nested structure from outer constraint
			composedFields[fieldName] = {
				kind: 'nested',
				structure: outerConstraint.structure,
			};
		} else {
			// Keep other fields as-is
			composedFields[fieldName] = fieldType;
		}
	}

	return {
		kind: 'has',
		typeVar: innerConstraint.typeVar,
		structure: {
			fields: composedFields,
		},
	};
}

/**
 * Extract the final result type variable from a structural constraint.
 * For simple constraints like {street: α}, returns α.
 * For nested constraints, returns the deepest variable.
 */
export function extractResultTypeVar(
	constraint: HasStructureConstraint
): string | null {
	const fields = Object.values(constraint.structure.fields);

	if (fields.length !== 1) {
		return null; // Multi-field constraints not supported
	}

	const field = fields[0];

	if (field.kind === 'variable') {
		return field.name;
	}

	if (field.kind === 'nested') {
		// Recursively extract from nested structure
		const nestedConstraint: HasStructureConstraint = {
			kind: 'has',
			typeVar: 'dummy', // Not used in recursion
			structure: field.structure,
		};
		return extractResultTypeVar(nestedConstraint);
	}

	return null;
}