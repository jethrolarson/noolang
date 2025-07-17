import { type Program, type Type, unitType } from '../ast';
import { formatTypeError, createTypeError } from './type-errors';
import { typeToString } from './helpers';
import { type TypeState, type TypeResult } from './types';
import { satisfiesConstraint, validateAllSubstitutionConstraints } from './constraints';
import { substitute } from './substitute';
import { createTypeState, loadStdlib } from './type-operations';
import { typeExpression } from './expression-dispatcher';
import { typeAndDecorate } from './decoration';
import { initializeBuiltins } from './builtins';

// Re-export TypeResult from types module
export { type TypeResult } from './types';

// Re-export createTypeState from type-operations module
export { createTypeState } from './type-operations';

// Re-export freshTypeVariable from type-operations module
export { freshTypeVariable } from './type-operations';


// Re-export freeTypeVars from type-operations module
export { freeTypeVars } from './type-operations';

// Re-export freeTypeVarsEnv from type-operations module
export { freeTypeVarsEnv } from './type-operations';

// Re-export generalize from type-operations module
export { generalize } from './type-operations';

// Re-export instantiate from type-operations module
export { instantiate } from './type-operations';

// Re-export freshenTypeVariables from type-operations module
export { freshenTypeVariables } from './type-operations';


// Re-export loadStdlib from type-operations module
export { loadStdlib } from './type-operations';

// Re-export typeExpression from expression-dispatcher module
export { typeExpression } from './expression-dispatcher';


// Re-export type inference functions from their respective modules
export {
	typeLiteral,
	typeVariableExpr,
	typeFunction,
	typeDefinition,
	typeIf,
	typeBinary,
	typeMutableDefinition,
	typeMutation,
	typeImport,
	typeRecord,
	typeAccessor,
	typeTuple,
	typeList,
	typeWhere,
	typeTyped,
	typeConstrained,
} from './type-inference';

export {
	typeApplication,
	typePipeline,
} from './function-application';

export {
	typeMatch,
	typeTypeDefinition,
} from './pattern-matching';

export {
	typeAndDecorate,
} from './decoration';

// Re-export helper functions from their modules
export { validateAllSubstitutionConstraints } from './constraints';
// Export the main program typing function
export const typeProgram = (program: Program): TypeResult => {
	let state = createTypeState();
	state = initializeBuiltins(state);
	state = loadStdlib(state);

	let finalType: Type | null = null;

	for (const statement of program.statements) {
		const result = typeExpression(statement, state);
		state = result.state;
		finalType = result.type;
	}

	if (!finalType) {
		finalType = unitType();
	}

	// FINAL CONSTRAINT VALIDATION (disabled for performance)
	// validateAllSubstitutionConstraints(state);

	// NEW: Additional constraint validation for the final type
	if (finalType.kind === 'variable' && finalType.constraints) {
		for (const constraint of finalType.constraints) {
			if (constraint.kind === 'is') {
				const substitutedType = substitute(finalType, state.substitution);
				if (
					substitutedType.kind !== 'variable' &&
					!satisfiesConstraint(substitutedType, constraint.constraint)
				) {
					throw new Error(
						`Type ${typeToString(
							substitutedType
						)} does not satisfy constraint '${
							constraint.constraint
						}'. This error often indicates that a partial function (one that can fail at runtime) is being used in a context where total functions are required, such as function composition. Consider using total functions that return Option or Result types instead.`
					);
				}
			}
		}
	}

	return { type: finalType, state };
};
