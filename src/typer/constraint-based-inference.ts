/**
 * Constraint-based type inference
 *
 * This module provides a drop-in replacement for the existing type inference
 * functions that uses constraint generation and solving instead of direct
 * recursive unification.
 */

import {
	Expression,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	BinaryExpression,
	IfExpression,
	DefinitionExpression,
	Program,
	unitType,
} from '../ast';

import { TypeState, TypeResult, createPureTypeResult } from './types';
import {
	generateConstraintsForExpression,
	solveConstraintsAndGetResult,
} from './constraint-generation';
import { createTypeState, loadStdlib } from './type-operations';
import { initializeBuiltins } from './builtins';

// Constraint-based version of typeExpression
export const typeExpressionConstraintBased = (
	expr: Expression,
	state: TypeState
): TypeResult => {
	const constraintResult = generateConstraintsForExpression(expr, state);
	return solveConstraintsAndGetResult(constraintResult);
};

// Constraint-based version of typeProgram
export const typeProgramConstraintBased = (program: Program): TypeResult => {
	let state = createTypeState();
	state = initializeBuiltins(state);
	state = loadStdlib(state);

	let finalType = null;

	for (const statement of program.statements) {
		const result = typeExpressionConstraintBased(statement, state);
		state = result.state;
		finalType = result.type;
	}

	if (!finalType) {
		finalType = unitType();
	}

	return createPureTypeResult(finalType, state);
};

// Individual constraint-based type inference functions for compatibility

export const typeLiteralConstraintBased = (
	expr: LiteralExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeVariableExprConstraintBased = (
	expr: VariableExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeFunctionConstraintBased = (
	expr: FunctionExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeApplicationConstraintBased = (
	expr: ApplicationExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeBinaryConstraintBased = (
	expr: BinaryExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeIfConstraintBased = (
	expr: IfExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};

export const typeDefinitionConstraintBased = (
	expr: DefinitionExpression,
	state: TypeState
): TypeResult => {
	return typeExpressionConstraintBased(expr, state);
};
