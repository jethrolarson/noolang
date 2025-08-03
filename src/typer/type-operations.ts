import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	type Type,
	type Expression,
	typeVariable,
	type VariableType,
	type Constraint,
} from '../ast';
import { parse } from '../parser/parser';
import { Lexer } from '../lexer/lexer';
import { type TypeState, type TypeEnvironment, type TypeScheme } from './types';
import { createTraitRegistry } from './trait-system';
import { substitute } from './substitute';
import { typeExpression } from './expression-dispatcher';
import { constraintsEqual } from './helpers';

// Fresh type variable generation - optimized to avoid string concatenation
export const freshTypeVariable = (
	state: TypeState
): [VariableType, TypeState] => {
	const newCounter = state.counter + 1;
	const newType = typeVariable(`α${newCounter}`);
	// Avoid spreading the entire state object for better performance
	return [
		newType,
		{
			...state,
			counter: newCounter,
		},
	];
};

// Helper function to create ConstrainedType instances
export const createConstrainedType = (
	baseType: Type,
	constraints: Map<string, Constraint[]> // Use modern constraint format>
): Type => ({
	kind: 'constrained',
	baseType,
	constraints,
});

// Helper function to add a constraint to a type variable
export const addConstraintToType = (
	baseType: Type,
	varName: string,
	constraint: Constraint
): Type => {
	const constraints = new Map();
	constraints.set(varName, [constraint]);
	return createConstrainedType(baseType, constraints);
};

// Collect all free type variables in a type
export const freeTypeVars = (
	type: Type,
	acc: Set<string> = new Set()
): Set<string> => {
	switch (type.kind) {
		case 'variable':
			acc.add(type.name);
			break;
		case 'function':
			for (const param of type.params) freeTypeVars(param, acc);
			freeTypeVars(type.return, acc);
			break;
		case 'list':
			freeTypeVars(type.element, acc);
			break;
		case 'tuple':
			for (const el of type.elements) freeTypeVars(el, acc);
			break;
		case 'record':
			Object.values(type.fields).forEach(v => freeTypeVars(v, acc));
			break;
		case 'union':
			type.types.forEach(t => freeTypeVars(t, acc));
			break;
		case 'variant':
			type.args.forEach(arg => freeTypeVars(arg, acc));
			break;
	}
	return acc;
};

// Collect all free type variables in the environment
export const freeTypeVarsEnv = (env: TypeEnvironment): Set<string> => {
	const acc = new Set<string>();
	for (const scheme of env.values()) {
		freeTypeVars(scheme.type, acc);
	}
	return acc;
};

// Generalize a type with respect to the environment
export const generalize = (
	type: Type,
	env: TypeEnvironment,
	substitution: Map<string, Type>
): TypeScheme => {
	// Apply current substitution to the type before generalizing
	const substitutedType = substitute(type, substitution);
	const typeVars = freeTypeVars(substitutedType);
	const envVars = freeTypeVarsEnv(env);
	const quantifiedVars: string[] = [];

	for (const varName of typeVars) {
		if (!envVars.has(varName)) {
			quantifiedVars.push(varName);
		}
	}
	return { type: substitutedType, quantifiedVars };
};

// Instantiate a type scheme by freshening all quantified variables (threading state)
export const instantiate = (
	scheme: TypeScheme,
	state: TypeState
): [Type, TypeState] => {
	const mapping = new Map<string, Type>();
	let currentState = state;
	for (const varName of scheme.quantifiedVars) {
		const [freshVar, newState] = freshTypeVariable(currentState);
		mapping.set(varName, freshVar);
		currentState = newState;
	}

	const [instantiatedType, finalState] = freshenTypeVariables(
		scheme.type,
		mapping,
		currentState
	);

	return [instantiatedType, finalState];
};


// Replace type variables with fresh ones, threading state
export const freshenTypeVariables = (
	type: Type,
	mapping: Map<string, Type> = new Map(),
	state: TypeState
): [Type, TypeState] => {
	switch (type.kind) {
		case 'variable': {
			const freshVar = mapping.get(type.name);
			if (freshVar) {
				// Copy constraints from the original variable to the fresh one
				if (freshVar.kind === 'variable') {
					freshVar.constraints = freshVar.constraints || [];
					if (type.constraints) {
						for (const c of type.constraints) {
							if (
								!freshVar.constraints.some(existing =>
									constraintsEqual(existing, c)
								)
							) {
								freshVar.constraints.push(c);
							}
						}
					}
				}
				return [freshVar, state];
			}
			return [type, state];
		}
		case 'function': {
			let currentState = state;
			const newParams: Type[] = [];
			for (const param of type.params) {
				const [newParam, nextState] = freshenTypeVariables(
					param,
					mapping,
					currentState
				);
				newParams.push(newParam);
				currentState = nextState;
			}
			const [newReturn, finalState] = freshenTypeVariables(
				type.return,
				mapping,
				currentState
			);
			
			// Handle function-level constraints
			let newConstraints: Constraint[] | undefined = undefined;
			if (type.constraints && type.constraints.length > 0) {
				newConstraints = type.constraints.map(constraint => {
					// Update constraint variable names using the mapping
					if ('typeVar' in constraint) {
						const mappedVar = mapping.get(constraint.typeVar);
						if (mappedVar && mappedVar.kind === 'variable') {
							return {
								...constraint,
								typeVar: mappedVar.name,
							};
						}
					}
					return constraint;
				});
			}
			
			const freshenedFunction = { ...type, params: newParams, return: newReturn };
			if (newConstraints) {
				freshenedFunction.constraints = newConstraints;
			}
			return [freshenedFunction, finalState];
		}
		case 'list': {
			const [newElem, nextState] = freshenTypeVariables(
				type.element,
				mapping,
				state
			);
			return [{ ...type, element: newElem }, nextState];
		}
		case 'tuple': {
			let currentState = state;
			const newElems: Type[] = [];
			for (const el of type.elements) {
				const [newEl, nextState] = freshenTypeVariables(
					el,
					mapping,
					currentState
				);
				newElems.push(newEl);
				currentState = nextState;
			}
			return [{ ...type, elements: newElems }, currentState];
		}
		case 'record': {
			let currentState = state;
			const newFields: { [key: string]: Type } = {};
			for (const [key, fieldType] of Object.entries(type.fields)) {
				const [newField, nextState] = freshenTypeVariables(
					fieldType,
					mapping,
					currentState
				);
				newFields[key] = newField;
				currentState = nextState;
			}
			return [{ ...type, fields: newFields }, currentState];
		}
		case 'union': {
			let currentState = state;
			const newTypes: Type[] = [];
			for (const t of type.types) {
				const [newType, nextState] = freshenTypeVariables(
					t,
					mapping,
					currentState
				);
				newTypes.push(newType);
				currentState = nextState;
			}
			return [{ ...type, types: newTypes }, currentState];
		}
		case 'variant': {
			// Check if this variant name is actually a type parameter that should be freshened
			const mappedVar = mapping.get(type.name);
			if (mappedVar && mappedVar.kind === 'variable') {
				// This variant represents a type parameter, replace it with the fresh type variable
				let currentState = state;
				const newArgs: Type[] = [];
				for (const arg of type.args) {
					const [newArg, nextState] = freshenTypeVariables(
						arg,
						mapping,
						currentState
					);
					newArgs.push(newArg);
					currentState = nextState;
				}
				return [
					{
						kind: 'variant',
						name: mappedVar.name,
						args: newArgs,
					},
					currentState,
				];
			} else {
				// This is a concrete variant type (Bool, Option, etc.), just freshen the args
				let currentState = state;
				const newArgs: Type[] = [];
				for (const arg of type.args) {
					const [newArg, nextState] = freshenTypeVariables(
						arg,
						mapping,
						currentState
					);
					newArgs.push(newArg);
					currentState = nextState;
				}
				return [{ ...type, args: newArgs }, currentState];
			}
		}
		default:
			return [type, state];
	}
};

// Helper to flatten semicolon-separated binary expressions into individual statements
export const flattenStatements = (expr: Expression): Expression[] => {
	if (expr.kind === 'binary' && expr.operator === ';') {
		return [...flattenStatements(expr.left), ...flattenStatements(expr.right)];
	}
	return [expr];
};

// Load standard library from stdlib.noo
export const loadStdlib = (state: TypeState): TypeState => {
	try {
		// Find stdlib.noo relative to this file
		const stdlibPath = path.join(__dirname, '..', '..', 'stdlib.noo');

		if (!fs.existsSync(stdlibPath)) {
			console.warn(`Warning: stdlib.noo not found at ${stdlibPath}`);
			return state;
		}

		const stdlibContent = fs.readFileSync(stdlibPath, 'utf-8');
		const lexer = new Lexer(stdlibContent);
		const tokens = lexer.tokenize();
		const stdlibProgram = parse(tokens);

		// Flatten any semicolon-separated statements
		const allStatements: Expression[] = [];
		for (const statement of stdlibProgram.statements) {
			allStatements.push(...flattenStatements(statement));
		}

		let currentState = state;
		for (const statement of allStatements) {
			const result = typeExpression(statement, currentState);
			currentState = result.state;
		}

		return currentState;
	} catch (error) {
		console.warn(`Warning: Failed to load stdlib.noo:`, error);
		return state;
	}
};

// Initialize type state
export const createTypeState = (): TypeState => ({
	environment: new Map(),
	substitution: new Map(),
	counter: 0,
	constraints: [],
	adtRegistry: new Map(),
	accessorCache: new Map(),
	traitRegistry: createTraitRegistry(), // NEW: Simple trait system
});

// Clean substitutions from type state while preserving environment and other state
// This is used in REPL to prevent type pollution between evaluations
export const cleanSubstitutions = (state: TypeState): TypeState => ({
	...state,
	substitution: new Map(), // Clear substitutions but keep environment
	constraints: [], // Clear constraints as well
});
