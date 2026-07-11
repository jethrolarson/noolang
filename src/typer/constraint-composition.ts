import {
	hasStructureConstraint,
	type HasStructureConstraint,
	type StructureFieldType,
	type Type,
} from '../ast';
import {
	getConstraints,
	resolveVarName,
	type ConstraintStore,
} from './constraint-store';

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

	return hasStructureConstraint(innerConstraint.typeVar, {
		fields: composedFields,
	});
}

/**
 * Fold a variable's structural constraints, and those of the variables its
 * fields point at, into a single nested constraint.
 *
 * `getCity (getAddress p)` records two separate links — `p has {@address x}`
 * and `x has {@city y}` — because each accessor constrains its own argument.
 * Walking that graph and nesting each field's own constraint into its position
 * yields `p has {@address {@city y}}`, with `y` still the variable the body
 * actually returns.
 *
 * Follows the constraint GRAPH, not the syntax tree, so a chain through
 * let-bound accessors composes exactly like an inline one.
 *
 * Returns null when the variable has no structural constraint. `seen` guards
 * against a cyclic constraint graph.
 */
export function composeConstraintChain(
	varName: string,
	store: ConstraintStore,
	substitution: Map<string, Type>,
	seen: Set<string> = new Set()
): HasStructureConstraint | null {
	const key = resolveVarName(varName, substitution);
	if (seen.has(key)) return null;

	const base = getConstraints(store, key, substitution).find(
		(c): c is HasStructureConstraint => c.kind === 'has'
	);
	if (!base) return null;

	const nextSeen = new Set(seen).add(key);
	let composed: HasStructureConstraint = hasStructureConstraint(key, {
		fields: { ...base.structure.fields },
	});

	for (const [, fieldType] of Object.entries(base.structure.fields)) {
		if (fieldType.kind !== 'variable') continue;
		const nested = composeConstraintChain(
			fieldType.name,
			store,
			substitution,
			nextSeen
		);
		if (!nested) continue;
		composed = composeStructuralConstraints(composed, nested, fieldType.name);
	}

	return composed;
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
		const nestedConstraint: HasStructureConstraint = hasStructureConstraint(
			'dummy', // Not used in recursion
			field.structure
		);
		return extractResultTypeVar(nestedConstraint);
	}

	return null;
}
