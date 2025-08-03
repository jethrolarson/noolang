import { type Effect, type Program, Type, unitType } from '../ast';
import { type TypeState, unionEffects } from './types';
import { createTypeState, loadStdlib } from './type-operations';
import { initializeBuiltins } from './builtins';
import { typeExpression } from './expression-dispatcher';
import { substitute } from './substitute';

// Decorate AST nodes with inferred types - now uses single-pass typing
export const typeAndDecorate = (
	program: Program,
	initialState?: TypeState
): {
	program: Program;
	type: Type;
	effects: Set<Effect>;
	state: TypeState;
} => {
	let state = initialState || createTypeState();
	// Always ensure builtins and stdlib are loaded, regardless of whether initialState was provided
	if (!initialState || !state.traitRegistry.definitions.size) {
		state = initializeBuiltins(state);
		state = loadStdlib(state);
	}

	// Process all statements with typeExpression, then decorate the AST
	let type: Type = unitType();
	let effects = new Set<Effect>();

	for (const statement of program.statements) {
		// Type the statement (this does all the work)
		const result = typeExpression(statement, state);
		state = result.state;
		type = result.type;
		effects = unionEffects(effects, result.effects);

		// Now just add the computed type to the AST node (lightweight decoration)
		statement.type = result.type;
	}

	// Apply final substitution to the program type
	const finalType = substitute(type, state.substitution);

	return {
		program,
		state,
		type: finalType,
		effects,
	};
};
