/**
 * Phase 3 Effect Validation System
 *
 * This module implements effect validation and checking for Noolang's effect system.
 * It ensures that functions with declared effects properly propagate those effects
 * and that effect annotations are enforced during type checking.
 */

import { Type, Effect, FunctionType, FunctionExpression } from '../ast';
import { TypeState, TypeResult } from './types';
import { getExprLocation } from './helpers';
import { formatTypeError, createTypeError } from './type-errors';

/**
 * Validates that a function's declared effects match its computed effects
 */
export const validateFunctionEffects = (
	declaredEffects: Set<Effect>,
	computedEffects: Set<Effect>,
	location?: { line: number; column: number }
): void => {
	// Check if computed effects are a subset of declared effects
	for (const effect of computedEffects) {
		if (!declaredEffects.has(effect)) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Function uses effect '${effect}' but does not declare it. ` +
							`Declared effects: [${Array.from(declaredEffects).join(', ')}], ` +
							`Required effects: [${Array.from(computedEffects).join(', ')}]`,
						{},
						location || { line: 1, column: 1 }
					)
				)
			);
		}
	}

	// Optional: Warn about unused declared effects (currently disabled)
	// This could be enabled as a lint warning in the future
	const unusedEffects = new Set<Effect>();
	for (const effect of declaredEffects) {
		if (!computedEffects.has(effect)) {
			unusedEffects.add(effect);
		}
	}

	// For now, we allow over-declaration of effects (conservative approach)
	// In the future, this could emit warnings for unused effects
};

/**
 * Validates that a function call respects effect constraints
 */
export const validateFunctionCall = (
	funcType: Type,
	callEffects: Set<Effect>,
	allowedEffects: Set<Effect>,
	location?: { line: number; column: number }
): void => {
	if (funcType.kind === 'function') {
		const requiredEffects = funcType.effects;

		// Check that all function effects are allowed in current context
		for (const effect of requiredEffects) {
			if (!allowedEffects.has(effect)) {
				throw new Error(
					formatTypeError(
						createTypeError(
							`Cannot call function with effect '${effect}' in pure context. ` +
								`Function requires effects: [${Array.from(requiredEffects).join(', ')}], ` +
								`but only these effects are allowed: [${Array.from(allowedEffects).join(', ')}]`,
							{},
							location || { line: 1, column: 1 }
						)
					)
				);
			}
		}
	}
};

/**
 * Extracts declared effects from a function expression's type annotation
 */
export const extractDeclaredEffects = (
	funcExpr: FunctionExpression,
	funcType: Type
): Set<Effect> => {
	if (funcType.kind === 'function') {
		return funcType.effects;
	}
	return new Set();
};

/**
 * Validates that effectful operations are properly declared
 */
export const validateEffectDeclaration = (
	expression: any,
	requiredEffects: Set<Effect>,
	declaredEffects: Set<Effect>,
	location?: { line: number; column: number }
): void => {
	for (const effect of requiredEffects) {
		if (!declaredEffects.has(effect)) {
			throw new Error(
				formatTypeError(
					createTypeError(
						`Expression requires effect '${effect}' but it is not declared. ` +
							`Add '!${effect}' to the type annotation.`,
						{},
						location || { line: 1, column: 1 }
					)
				)
			);
		}
	}
};

/**
 * Checks if an effect set is "pure" (contains no effects)
 */
export const isPure = (effects: Set<Effect>): boolean => {
	return effects.size === 0;
};

/**
 * Checks if effects are compatible (subset relationship)
 */
export const areEffectsCompatible = (
	required: Set<Effect>,
	available: Set<Effect>
): boolean => {
	for (const effect of required) {
		if (!available.has(effect)) {
			return false;
		}
	}
	return true;
};

/**
 * Creates a human-readable string from an effect set
 */
export const effectsToString = (effects: Set<Effect>): string => {
	if (effects.size === 0) {
		return 'pure';
	}
	return Array.from(effects)
		.map(e => `!${e}`)
		.join(' ');
};

/**
 * Merges effect sets with proper union semantics
 */
export const mergeEffects = (...effectSets: Set<Effect>[]): Set<Effect> => {
	const result = new Set<Effect>();
	for (const effects of effectSets) {
		for (const effect of effects) {
			result.add(effect);
		}
	}
	return result;
};
