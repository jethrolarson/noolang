import {
	type ApplicationExpression,
	type Type,
	type Effect,
	functionType,
} from '../ast';
import { type TypeState, type TypeResult, createTypeResult } from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { freshTypeVariable } from './type-operations';

// Helper function to handle variable type application
export function handleVariableTypeApplication(
	expr: ApplicationExpression,
	funcType: Type,
	argTypes: Type[],
	currentState: TypeState,
	allEffects: Set<Effect>
): TypeResult {
	// If it's a type variable, create a function type and unify
	if (argTypes.length === 0) {
		return createTypeResult(funcType, allEffects, currentState);
	}

	const [paramType, newState] = freshTypeVariable(currentState);
	currentState = newState;
	const [returnType, finalState] = freshTypeVariable(currentState);
	currentState = finalState;

	const freshFunctionType = functionType([paramType], returnType);
	currentState = unify(funcType, freshFunctionType, currentState, {
		line: expr.location?.start.line || 1,
		column: expr.location?.start.column || 1,
	});
	currentState = unify(paramType, argTypes[0], currentState, {
		line: expr.location?.start.line || 1,
		column: expr.location?.start.column || 1,
	});

	return createTypeResult(
		substitute(returnType, currentState.substitution),
		allEffects,
		currentState
	);
}
