import {
	type ApplicationExpression,
	type Type,
	type Constraint,
	isConstraint,
} from '../ast';
import { type TypeState } from './types';
import { typeExpression } from './expression-dispatcher';
import { propagateConstraintToTypeVariable } from './helpers';

// Helper function to handle function composition constraint propagation
export function handleComposeConstraintPropagation(
	expr: ApplicationExpression,
	returnType: Type,
	currentState: TypeState
): Type {
	// Case 1: Direct compose function call
	if (
		expr.func.kind === 'variable' &&
		expr.func.name === 'compose' &&
		expr.args.length >= 1
	) {
		const fArg = expr.args[0]; // First function (f in "compose f g")
		const fResult = typeExpression(fArg, currentState);

		// If f has constraints and returnType is a function, propagate the constraints
		if (
			fResult.type.kind === 'function' &&
			fResult.type.constraints &&
			returnType.kind === 'function'
		) {
			const enhancedReturnType = { ...returnType };

			// Map constraint variables from f's type to the new function's type variables
			const updatedConstraints: Constraint[] = [];
			for (const constraint of fResult.type.constraints) {
				if (constraint.kind === 'is') {
					// Find the corresponding parameter in the new function
					// The first parameter of the composed function should inherit f's parameter constraints
					if (
						enhancedReturnType.params.length > 0 &&
						enhancedReturnType.params[0].kind === 'variable'
					) {
						const newConstraint = isConstraint(
							enhancedReturnType.params[0].name,
							constraint.constraint
						);
						updatedConstraints.push(newConstraint);
					}
				} else {
					// For non-"is" constraints, copy as-is for now
					updatedConstraints.push(constraint);
				}
			}

			enhancedReturnType.constraints = (
				enhancedReturnType.constraints || []
			).concat(updatedConstraints);

			// Also propagate constraints to parameter type variables in the result function
			for (const constraint of updatedConstraints) {
				if (constraint.kind === 'is') {
					propagateConstraintToTypeVariable(enhancedReturnType, constraint);
				}
			}

			return enhancedReturnType;
		}
	}

	// Case 2: Application to result of compose (e.g., (compose head) id)
	else if (
		expr.func.kind === 'application' &&
		expr.func.func.kind === 'variable' &&
		expr.func.func.name === 'compose' &&
		expr.func.args.length >= 1
	) {
		// This is applying the second argument to a partial compose result
		const fArg = expr.func.args[0]; // First function from the compose
		const fResult = typeExpression(fArg, currentState);

		if (
			fResult.type.kind === 'function' &&
			fResult.type.constraints &&
			returnType.kind === 'function'
		) {
			const enhancedReturnType = { ...returnType };

			// Map constraint variables from f's type to the new function's type variables
			const updatedConstraints: Constraint[] = [];
			for (const constraint of fResult.type.constraints) {
				if (constraint.kind === 'is') {
					// Find the corresponding parameter in the new function
					if (
						enhancedReturnType.params.length > 0 &&
						enhancedReturnType.params[0].kind === 'variable'
					) {
						const newConstraint = isConstraint(
							enhancedReturnType.params[0].name,
							constraint.constraint
						);
						updatedConstraints.push(newConstraint);
					}
				} else {
					updatedConstraints.push(constraint);
				}
			}

			enhancedReturnType.constraints = (
				enhancedReturnType.constraints || []
			).concat(updatedConstraints);

			for (const constraint of updatedConstraints) {
				if (constraint.kind === 'is') {
					propagateConstraintToTypeVariable(enhancedReturnType, constraint);
				}
			}

			return enhancedReturnType;
		}
	}

	return returnType;
}
