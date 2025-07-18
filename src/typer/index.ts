import { type Program, type Type, unitType, type Effect } from '../ast';
import { formatTypeError, createTypeError } from './type-errors';
import { typeToString } from './helpers';
import { type TypeState, type TypeResult, createPureTypeResult, unionEffects } from './types';
import { satisfiesConstraint, validateAllSubstitutionConstraints } from './constraints';
import { substitute } from './substitute';
import { createTypeState, loadStdlib } from './type-operations';
import { typeExpression } from './expression-dispatcher';
import { typeAndDecorate } from './decoration';
import { initializeBuiltins } from './builtins';

// Re-export TypeResult and effect helpers from types module
export { 
	type TypeResult,
	emptyEffects,
	singleEffect,
	unionEffects,
	createTypeResult,
	createPureTypeResult
} from './types';

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
	let allEffects = new Set<Effect>();

	for (const statement of program.statements) {
		const result = typeExpression(statement, state);
		state = result.state;
		finalType = result.type;
		allEffects = unionEffects(allEffects, result.effects);
	}

	if (!finalType) {
		finalType = unitType();
	}

	return { type: finalType, effects: allEffects, state };
};
