/**
 * Constraint generation for the constraint-based unification system
 * 
 * This module generates unification constraints from type inference operations
 * instead of performing unification directly. This allows for better error
 * reporting, performance optimization, and support for complex constraint systems.
 */

import {
	Type,
	Expression,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	BinaryExpression,
	IfExpression,
	DefinitionExpression,
	intType,
	stringType,
	boolType,
	functionType,
	typeVariable,
	unitType,
} from '../ast';

import { TypeState, TypeResult } from './types';
import { ConstraintSolver, UnificationConstraint } from './constraint-solver';
import { freshTypeVariable, instantiate } from './type-operations';
import { getExprLocation } from './helpers';

// Extended type result that includes constraints
export interface ConstraintTypeResult {
	type: Type;
	state: TypeState;
	constraints: UnificationConstraint[];
}

// Generate constraints for literal expressions
export const generateLiteralConstraints = (
	expr: LiteralExpression,
	state: TypeState
): ConstraintTypeResult => {
	const value = expr.value;
	let type: Type;

	if (typeof value === 'number') {
		type = intType();
	} else if (typeof value === 'string') {
		type = stringType();
	} else if (typeof value === 'boolean') {
		type = boolType();
	} else {
		// Unknown literal type - create a fresh type variable
		const [freshVar, newState] = freshTypeVariable(state);
		return {
			type: freshVar,
			state: newState,
			constraints: []
		};
	}

	return {
		type,
		state,
		constraints: []
	};
};

// Generate constraints for variable expressions
export const generateVariableConstraints = (
	expr: VariableExpression,
	state: TypeState
): ConstraintTypeResult => {
	const scheme = state.environment.get(expr.name);
	if (!scheme) {
		// Create a fresh type variable for undefined variables
		// The error will be caught during constraint solving
		const [freshVar, newState] = freshTypeVariable(state);
		return {
			type: freshVar,
			state: newState,
			constraints: []
		};
	}

	const [instantiatedType, newState] = instantiate(scheme, state);

	return {
		type: instantiatedType,
		state: newState,
		constraints: []
	};
};

// Generate constraints for function expressions
export const generateFunctionConstraints = (
	expr: FunctionExpression,
	state: TypeState
): ConstraintTypeResult => {
	// Create fresh type variables for parameters
	let currentState = state;
	const paramTypes: Type[] = [];
	const constraints: UnificationConstraint[] = [];

	// Extend environment with parameter types
	const extendedEnv = new Map(currentState.environment);
	
	for (const param of expr.params) {
		const [paramType, nextState] = freshTypeVariable(currentState);
		paramTypes.push(paramType);
		extendedEnv.set(param, { type: paramType, quantifiedVars: [] });
		currentState = nextState;
	}

	const bodyState = { ...currentState, environment: extendedEnv };

	// Generate constraints for the function body
	const bodyResult = generateConstraintsForExpression(expr.body, bodyState);
	constraints.push(...bodyResult.constraints);

	// Create function type
	const funcType = functionType(paramTypes, bodyResult.type);

	return {
		type: funcType,
		state: bodyResult.state,
		constraints
	};
};

// Generate constraints for function application
export const generateApplicationConstraints = (
	expr: ApplicationExpression,
	state: TypeState
): ConstraintTypeResult => {
	const constraints: UnificationConstraint[] = [];
	
	// Generate constraints for function
	const funcResult = generateConstraintsForExpression(expr.func, state);
	constraints.push(...funcResult.constraints);

	// Generate constraints for arguments
	let currentState = funcResult.state;
	const argTypes: Type[] = [];
	
	for (const arg of expr.args) {
		const argResult = generateConstraintsForExpression(arg, currentState);
		constraints.push(...argResult.constraints);
		argTypes.push(argResult.type);
		currentState = argResult.state;
	}

	// Create fresh type variable for result
	const [resultType, finalState] = freshTypeVariable(currentState);

	// Create expected function type
	const expectedFuncType = functionType(argTypes, resultType);

	// Add constraint that function type equals expected type
	constraints.push({
		kind: 'equal',
		type1: funcResult.type,
		type2: expectedFuncType,
		location: getExprLocation(expr)
	});

	return {
		type: resultType,
		state: finalState,
		constraints
	};
};

// Generate constraints for binary expressions
export const generateBinaryConstraints = (
	expr: BinaryExpression,
	state: TypeState
): ConstraintTypeResult => {
	const constraints: UnificationConstraint[] = [];

	// Generate constraints for operands
	const leftResult = generateConstraintsForExpression(expr.left, state);
	constraints.push(...leftResult.constraints);

	const rightResult = generateConstraintsForExpression(expr.right, leftResult.state);
	constraints.push(...rightResult.constraints);

	// Handle different operators
	const location = getExprLocation(expr);
	
	switch (expr.operator) {
		case '+':
		case '-':
		case '*':
		case '/':
			// Arithmetic operators: both operands and result are numbers
			constraints.push(
				{ kind: 'equal', type1: leftResult.type, type2: intType(), location },
				{ kind: 'equal', type1: rightResult.type, type2: intType(), location }
			);
			return {
				type: intType(),
				state: rightResult.state,
				constraints
			};

		case '==':
		case '!=':
		case '<':
		case '>':
		case '<=':
		case '>=':
			// Comparison operators: operands must be same type, result is boolean
			constraints.push({
				kind: 'equal',
				type1: leftResult.type,
				type2: rightResult.type,
				location
			});
			return {
				type: boolType(),
				state: rightResult.state,
				constraints
			};

		case ';':
			// Sequence: result type is the right operand's type
			return {
				type: rightResult.type,
				state: rightResult.state,
				constraints
			};

		default:
			// Unknown operator - create fresh type variable
			const [resultType, finalState] = freshTypeVariable(rightResult.state);
			return {
				type: resultType,
				state: finalState,
				constraints
			};
	}
};

// Generate constraints for if expressions
export const generateIfConstraints = (
	expr: IfExpression,
	state: TypeState
): ConstraintTypeResult => {
	const constraints: UnificationConstraint[] = [];

	// Generate constraints for condition
	const condResult = generateConstraintsForExpression(expr.condition, state);
	constraints.push(...condResult.constraints);

	// Condition must be boolean
	constraints.push({
		kind: 'equal',
		type1: condResult.type,
		type2: boolType(),
		location: getExprLocation(expr.condition)
	});

	// Generate constraints for then and else branches
	const thenResult = generateConstraintsForExpression(expr.then, condResult.state);
	constraints.push(...thenResult.constraints);

	const elseResult = generateConstraintsForExpression(expr.else, thenResult.state);
	constraints.push(...elseResult.constraints);

	// Both branches must have the same type
	constraints.push({
		kind: 'equal',
		type1: thenResult.type,
		type2: elseResult.type,
		location: getExprLocation(expr)
	});

	return {
		type: thenResult.type,
		state: elseResult.state,
		constraints
	};
};

// Generate constraints for definition expressions
export const generateDefinitionConstraints = (
	expr: DefinitionExpression,
	state: TypeState
): ConstraintTypeResult => {
	// Generate constraints for the value
	const valueResult = generateConstraintsForExpression(expr.value, state);

	// Add the definition to the environment
	const extendedEnv = new Map(valueResult.state.environment);
	extendedEnv.set(expr.name, { type: valueResult.type, quantifiedVars: [] });

	const newState = { ...valueResult.state, environment: extendedEnv };

	return {
		type: unitType(),
		state: newState,
		constraints: valueResult.constraints
	};
};

// Main constraint generation dispatcher
export const generateConstraintsForExpression = (
	expr: Expression,
	state: TypeState
): ConstraintTypeResult => {
	switch (expr.kind) {
		case 'literal':
			return generateLiteralConstraints(expr, state);
		case 'variable':
			return generateVariableConstraints(expr, state);
		case 'function':
			return generateFunctionConstraints(expr, state);
		case 'application':
			return generateApplicationConstraints(expr, state);
		case 'binary':
			return generateBinaryConstraints(expr, state);
		case 'if':
			return generateIfConstraints(expr, state);
		case 'definition':
			return generateDefinitionConstraints(expr, state);
		default:
			// For unhandled expression types, create a fresh type variable
			const [freshVar, newState] = freshTypeVariable(state);
			return {
				type: freshVar,
				state: newState,
				constraints: []
			};
	}
};

// Convert constraint-based result to traditional TypeResult
export const solveConstraintsAndGetResult = (
	constraintResult: ConstraintTypeResult
): TypeResult => {
	const solver = new ConstraintSolver();
	solver.addConstraints(constraintResult.constraints);
	
	const solution = solver.solve();
	
	if (!solution.success) {
		// Throw first error for now - could be improved with better error handling
		throw new Error(solution.errors[0] || 'Constraint solving failed');
	}

	// Apply the substitution to the result type
	const finalType = applySubstitutionToType(constraintResult.type, solution.substitution);

	// Also merge substitutions into the state
	const mergedSubstitution = new Map(constraintResult.state.substitution);
	for (const [typeVar, type] of solution.substitution) {
		mergedSubstitution.set(typeVar, type);
	}

	return {
		type: finalType,
		state: {
			...constraintResult.state,
			substitution: mergedSubstitution
		}
	};
};

// Helper to apply substitution to a type with cycle detection
const applySubstitutionToType = (type: Type, substitution: Map<string, Type>, seen: Set<string> = new Set()): Type => {
	switch (type.kind) {
		case 'variable':
			if (seen.has(type.name)) {
				// Cycle detected, return the variable as-is
				return type;
			}
			const sub = substitution.get(type.name);
			if (sub) {
				seen.add(type.name);
				const result = applySubstitutionToType(sub, substitution, seen);
				seen.delete(type.name);
				return result;
			}
			return type;
		
		case 'function':
			return {
				...type,
				params: type.params.map(p => applySubstitutionToType(p, substitution, seen)),
				return: applySubstitutionToType(type.return, substitution, seen)
			};
		
		case 'list':
			return {
				...type,
				element: applySubstitutionToType(type.element, substitution, seen)
			};
		
		case 'tuple':
			return {
				...type,
				elements: type.elements.map(e => applySubstitutionToType(e, substitution, seen))
			};
		
		case 'record':
			const newFields: { [key: string]: Type } = {};
			for (const [key, fieldType] of Object.entries(type.fields)) {
				newFields[key] = applySubstitutionToType(fieldType, substitution, seen);
			}
			return { ...type, fields: newFields };
		
		case 'variant':
			return {
				...type,
				args: type.args.map(a => applySubstitutionToType(a, substitution, seen))
			};
		
		default:
			return type;
	}
};