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

		// Populate protected type names to prevent shadowing of any existing types
		const protectedNames = new Set<string>(state.protectedTypeNames);
		// From environment: collect keys that represent type constructors or type aliases
		for (const [name] of state.environment.entries()) {
			// Heuristic: treat uppercase-leading identifiers as type names (constructors/variants)
			if (name && name[0] === name[0].toUpperCase()) {
				protectedNames.add(name);
			}
		}
		// From ADT registry: add ADT names
		for (const adtName of state.adtRegistry.keys()) {
			protectedNames.add(adtName);
		}
		state = { ...state, protectedTypeNames: protectedNames };
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

		// Apply current substitution to get the resolved type for the statement
		const resolvedStatementType = substitute(result.type, state.substitution);
		statement.type = resolvedStatementType;
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
