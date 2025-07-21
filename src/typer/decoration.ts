import {
	type Expression,
	type Program,
	type DefinitionExpression,
	type MutableDefinitionExpression,
	unitType,
} from '../ast';
import { type TypeState } from './types';
import { createTypeState, loadStdlib } from './type-operations';
import { initializeBuiltins } from './builtins';
import { typeExpression } from './expression-dispatcher';

// Decorate AST nodes with inferred types - now uses single-pass typing
export const typeAndDecorate = (program: Program, initialState?: TypeState) => {
	let state = initialState || createTypeState();
	if (!initialState) {
		state = initializeBuiltins(state);
		state = loadStdlib(state);
	}

	// Process all statements with typeExpression, then decorate the AST
	let currentState = state;
	let finalType = null;

	for (const statement of program.statements) {
		// Type the statement (this does all the work)
		const result = typeExpression(statement, currentState);
		currentState = result.state;
		finalType = result.type;

		// Now just add the computed type to the AST node (lightweight decoration)
		statement.type = result.type;
	}

	if (!finalType) {
		finalType = unitType();
	}

	return {
		program: { ...program },
		state: currentState,
	};
};
