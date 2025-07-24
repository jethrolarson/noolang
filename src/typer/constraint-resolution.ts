// LEGACY CONSTRAINT RESOLUTION - REMOVED
// This file has been gutted as part of the trait system rewrite

import { Type, Expression } from '../ast';
import { TypeState, TypeScheme } from './types';

// Legacy exports kept for compatibility - all return empty/false values
export function tryResolveConstraintFunction(
	_functionName: string,
	_args: Expression[],
	_argTypes: Type[],
	_state: TypeState
): { resolved: boolean; specializedName?: string; typeScheme?: TypeScheme } {
	return { resolved: false };
}

export function generateConstraintError(): string {
	return 'Constraint system has been removed';
}

export function decorateEnvironmentWithConstraintFunctions(state: TypeState): TypeState {
	return state;
}

export function resolveConstraintVariable(): { resolved: boolean; needsResolution: boolean; constraintName?: string; functionName?: string } {
	return { resolved: false, needsResolution: false };
}

export function createConstraintFunctionType(): Type {
	throw new Error('Constraint system has been removed');
}