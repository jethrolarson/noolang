// Re-export TypeResult and effect helpers from types module
export {
	type TypeResult,
	emptyEffects,
	singleEffect,
	unionEffects,
	createTypeResult,
	createPureTypeResult,
} from './types';

// Re-export createTypeState from type-operations module
export { createTypeState, cleanSubstitutions } from './type-operations';

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

export { typeApplication, typePipeline } from './function-application';

export { typeMatch, typeTypeDefinition } from './pattern-matching';

export { typeAndDecorate } from './decoration';
