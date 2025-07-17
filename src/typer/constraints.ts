import {typeVariable, Constraint, Type, HasFieldConstraint, IsConstraint, ImplementsConstraint, CustomConstraint} from "../ast"
import { TypeState } from "./types";
import { formatTypeError, createTypeError } from "./type-errors";
import { substitute } from "./substitute";
import { constraintsEqual, isTypeKind, typeToString } from "./helpers";
import { unify } from "./unify";

// Constraint solving functions
export const solveConstraints = (
	constraints: Constraint[],
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	let currentState = state;

	for (const constraint of constraints) {
		currentState = solveConstraint(constraint, currentState, location);
	}

	return currentState;
};

export const solveConstraint = (
	constraint: Constraint,
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	switch (constraint.kind) {
		case "is":
			return solveIsConstraint(constraint, state, location);
		case "hasField":
			return solveHasFieldConstraint(constraint, state, location);
		case "implements":
			return solveImplementsConstraint(constraint, state, location);
		case "custom":
			return solveCustomConstraint(constraint, state, location);
		default:
			return state;
	}
};

const solveIsConstraint = (
	constraint: { kind: "is"; typeVar: string; constraint: string },
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	// Validate constraint name first
	validateConstraintName(constraint.constraint);

	const typeVar = substitute(
		typeVariable(constraint.typeVar),
		state.substitution,
	);

	// If the type variable has been unified to a concrete type, check if it satisfies the constraint
	if (typeVar.kind !== "variable") {
		// Check if the concrete type satisfies the constraint
		if (!satisfiesConstraint(typeVar, constraint.constraint)) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Type ${typeToString(
							typeVar,
							state.substitution,
						)} does not satisfy constraint '${
							constraint.constraint
						}'. This often occurs when trying to use a partial function (one that can fail) in an unsafe context like function composition. Consider using total functions that return Option or Result types instead.`,
						{},
						location || { line: 1, column: 1 },
					),
				),
			);
		}
	} else {
		// For type variables, we need to track the constraint for later solving
		// Add the constraint to the type variable if it doesn't already have it
		if (!typeVar.constraints) {
			typeVar.constraints = [];
		}

		// Check if this constraint is already present
		const existingConstraint = typeVar.constraints.find(
			(c) =>
				c.kind === "is" &&
				c.typeVar === constraint.typeVar &&
				c.constraint === constraint.constraint,
		);

		if (!existingConstraint) {
			typeVar.constraints.push(constraint);
		}
	}

	return state;
};

const solveHasFieldConstraint = (
	constraint: {
		kind: "hasField";
		typeVar: string;
		field: string;
		fieldType: Type;
	},
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	const typeVar = substitute(
		typeVariable(constraint.typeVar),
		state.substitution,
	);

	if (typeVar.kind === "record") {
		// Check if the record has the required field with the right type
		if (!(constraint.field in typeVar.fields)) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Record type missing required field '${constraint.field}'`,
						{},
						location || { line: 1, column: 1 },
					),
				),
			);
		}

		// Unify the field type
		let newState = state;
		newState = unify(
			typeVar.fields[constraint.field],
			constraint.fieldType,
			newState,
			location,
		);

		return newState;
	} else if (typeVar.kind === "variable") {
		// For type variables, we'll track the constraint for later solving
		return state;
	} else {
		throw new Error(
			formatTypeError(
				createTypeError(
					`Type ${typeToString(
						typeVar,
						state.substitution,
					)} cannot have fields`,
					{},
					location || { line: 1, column: 1 },
				),
			),
		);
	}
};

const solveImplementsConstraint = (
	constraint: { kind: "implements"; typeVar: string; interfaceName: string },
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	// For now, we'll just track the constraint
	// In a full implementation, we'd check if the type implements the interface
	return state;
};

const solveCustomConstraint = (
	constraint: {
		kind: "custom";
		typeVar: string;
		constraint: string;
		args: Type[];
	},
	state: TypeState,
	location?: { line: number; column: number },
): TypeState => {
	// For now, we'll just track the constraint
	// In a full implementation, we'd call the custom constraint solver
	return state;
};

// Validate that a constraint name is valid
export const validateConstraintName = (constraint: string): void => {
	// All constraints are now meaningless type checks, so reject them all
	throw new Error(
		`Constraint '${constraint}' is not supported. Use hasField constraints for record typing instead.`,
	);
};

export const satisfiesConstraint = (type: Type, constraint: string): boolean => {
	// All non-hasField constraints are meaningless, so they're not supported
	return false;
};




// Helper: Recursively push a constraint to all type variables inside a type
export function propagateConstraintToType(type: Type, constraint: Constraint) {
	switch (type.kind) {
		case "variable":
			type.constraints = type.constraints || [];
			if (!type.constraints.some((c) => constraintsEqual(c, constraint))) {
				type.constraints.push(constraint);
			} else {
			}
			break;
		case "function":
			for (const param of type.params) {
				propagateConstraintToType(param, constraint);
			}
			propagateConstraintToType(type.return, constraint);
			break;
		case "list":
			propagateConstraintToType(type.element, constraint);
			break;
		case "tuple":
			for (const el of type.elements) {
				propagateConstraintToType(el, constraint);
			}
			break;
		case "record":
			for (const fieldType of Object.values(type.fields)) {
				propagateConstraintToType(fieldType, constraint);
			}
			break;
		case "union":
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
	substitution: Map<string, Type>,
): Constraint[] {
	const seen = new Set<string>();
	let constraints: Constraint[] = [];
	let currentVarName = varName;
	let currentType = substitution.get(currentVarName);

	while (currentType && isTypeKind(currentType, "variable")) {
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
	if (origType && isTypeKind(origType, "variable") && origType.constraints) {
		constraints = constraints.concat(origType.constraints);
	}

	return constraints;
}

 
// After type inference, validate all constraints in the substitution map
export function validateAllSubstitutionConstraints(state: TypeState) {
	for (const [varName, concreteType] of state.substitution.entries()) {
		// Only check if the concreteType is not a variable
		if (concreteType.kind !== "variable") {
			// Collect all constraints from the substitution chain
			const constraintsToCheck = collectAllConstraintsForVar(
				varName,
				state.substitution,
			);
			for (const constraint of constraintsToCheck) {
				if (
					constraint.kind === "hasField" &&
					isTypeKind(concreteType, "record")
				) {
					if (!(constraint.field in concreteType.fields)) {
						throw new Error(
							`Record type missing required field '${constraint.field}'`,
						);
					}
					// Optionally, unify field types here if needed
				} else if (constraint.kind === "is") {
					if (!satisfiesConstraint(concreteType, constraint.constraint)) {
						throw new Error(
							`Type variable '${varName}' was unified to ${typeToString(
								concreteType,
							)} but does not satisfy constraint '${
								constraint.constraint
							}'. This typically means a partial function is being used in an unsafe context. Consider using total functions that return Option or Result types instead of partial functions with constraints.`,
						);
					}
				}
			}
		}
	}
}