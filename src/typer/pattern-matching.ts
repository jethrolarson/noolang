import {
	type TypeDefinitionExpression,
	type MatchExpression,
	type MatchCase,
	type Pattern,
	type Type,
	typeVariable,
	functionType,
	unitType,
	floatType,
	stringType,
} from '../ast';
import {
	type TypeState,
	type TypeResult,
	createTypeResult,
	createPureTypeResult,
	unionEffects,
} from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { freshTypeVariable } from './type-operations';
import { typeExpression } from './expression-dispatcher';
import { isTypeKind, typeToString } from './helpers';

// Type inference for ADT type definitions
export const typeTypeDefinition = (
	expr: TypeDefinitionExpression,
	state: TypeState
): TypeResult => {
	const { name, typeParams, constructors } = expr;

	// Create stable type variables for the ADT's type parameters
	const typeVarMap = new Map<string, Type>();
	for (const param of typeParams) {
		typeVarMap.set(param, typeVariable(param));
	}

	// Create the ADT type using the stable type variables
	const adtType: Type = {
		kind: 'variant',
		name,
		args: typeParams.map(param => typeVarMap.get(param)!)
	};

	// Process constructors and add to environment first (for mutual recursion)
	let currentState = state;
	const constructorMap = new Map<string, Type[]>();

	for (const constructor of constructors) {
		const constructorTypes: Type[] = [];
		
		for (const argType of constructor.args) {
			// Substitute type parameters with our stable variables and handle recursive references
			const processedType = substituteTypeParameters(argType, typeVarMap, name, adtType);
			constructorTypes.push(processedType);
		}
		
		constructorMap.set(constructor.name, constructorTypes);
		
		// Add constructor to environment as a function with proper quantification
		let constructorType: Type;
		if (constructorTypes.length === 0) {
			// Nullary constructor: just the ADT type
			constructorType = adtType;
		} else {
			// N-ary constructor: function from args to ADT type
			constructorType = functionType(constructorTypes, adtType);
		}

		// Add constructor to environment with proper quantification
		const newEnv = new Map(currentState.environment);
		newEnv.set(constructor.name, {
			type: constructorType,
			quantifiedVars: typeParams,
		});
		currentState = { ...currentState, environment: newEnv };
	}

	// Update the ADT registry with complete constructor information
	const finalRegistry = new Map(currentState.adtRegistry);
	finalRegistry.set(name, {
		typeParams,
		constructors: constructorMap
	});

	currentState = { ...currentState, adtRegistry: finalRegistry };

	// Type definitions have unit type
	return createPureTypeResult(unitType(), currentState);
};

// Helper function to substitute type parameters and handle recursive references
const substituteTypeParameters = (
	type: Type,
	typeVarMap: Map<string, Type>,
	recursiveName: string,
	recursiveType: Type
): Type => {
	switch (type.kind) {
		case 'variable':
			// Replace type parameters with their mapped variables
			const mappedVar = typeVarMap.get(type.name);
			return mappedVar || type;
			
		case 'variant':
			// Handle recursive references to the type being defined
			if (type.name === recursiveName) {
				return recursiveType;
			}
			// Recursively process type arguments
			return {
				...type,
				args: type.args.map(arg => substituteTypeParameters(arg, typeVarMap, recursiveName, recursiveType))
			};
			
		case 'function':
			return {
				...type,
				params: type.params.map(param => substituteTypeParameters(param, typeVarMap, recursiveName, recursiveType)),
				return: substituteTypeParameters(type.return, typeVarMap, recursiveName, recursiveType)
			};
			
		case 'list':
			return {
				...type,
				element: substituteTypeParameters(type.element, typeVarMap, recursiveName, recursiveType)
			};
			
		case 'record':
			const newFields: { [key: string]: Type } = {};
			for (const [key, fieldType] of Object.entries(type.fields)) {
				newFields[key] = substituteTypeParameters(fieldType, typeVarMap, recursiveName, recursiveType);
			}
			return { ...type, fields: newFields };
			
		case 'tuple':
			return {
				...type,
				elements: type.elements.map(elem => substituteTypeParameters(elem, typeVarMap, recursiveName, recursiveType))
			};
			
		default:
			return type;
	}
};

// Type inference for match expressions
export const typeMatch = (
	expr: MatchExpression,
	state: TypeState
): TypeResult => {
	// Type the expression being matched
	const exprResult = typeExpression(expr.expression, state);
	let currentState = exprResult.state;

	// Type each case and ensure they all return the same type
	if (expr.cases.length === 0) {
		throw new Error('Match expression must have at least one case');
	}

	// Type first case to get result type
	const firstCaseResult = typeMatchCase(
		expr.cases[0],
		exprResult.type,
		currentState
	);
	currentState = firstCaseResult.state;
	let resultType = firstCaseResult.type;
	let allEffects = unionEffects(exprResult.effects, firstCaseResult.effects);

	// Type remaining cases and unify with result type
	for (let i = 1; i < expr.cases.length; i++) {
		const caseResult = typeMatchCase(
			expr.cases[i],
			exprResult.type,
			currentState
		);
		currentState = caseResult.state;
		allEffects = unionEffects(allEffects, caseResult.effects);

		// Unify case result type with overall result type
		currentState = unify(
			resultType,
			caseResult.type,
			currentState,
			expr.cases[i].location.start
		);
		resultType = substitute(resultType, currentState.substitution);
	}

	return createTypeResult(resultType, allEffects, currentState);
};

// Type a single match case
const typeMatchCase = (
	matchCase: MatchCase,
	matchedType: Type,
	state: TypeState
): TypeResult => {
	// Type the pattern and get bindings
	const patternResult = typePattern(matchCase.pattern, matchedType, state);

	// Create new environment with pattern bindings
	const newEnv = new Map(patternResult.state.environment);
	for (const [name, type] of patternResult.bindings) {
		newEnv.set(name, { type, quantifiedVars: [] });
	}

	const envState = { ...patternResult.state, environment: newEnv };

	// Type the expression with pattern bindings in scope
	return typeExpression(matchCase.expression, envState);
};

// Type a pattern and return bindings
const typePattern = (
	pattern: Pattern,
	expectedType: Type,
	state: TypeState
): { state: TypeState; bindings: Map<string, Type> } => {
	const bindings = new Map<string, Type>();

	switch (pattern.kind) {
		case 'wildcard':
			// Wildcard matches anything, no bindings
			return { state, bindings };

		case 'variable':
			// Variable binds to the expected type
			bindings.set(pattern.name, expectedType);
			return { state, bindings };

		case 'constructor': {
			// Constructor pattern matching with type variable handling
			let actualType = expectedType;
			let currentState = state;

			// If expected type is a type variable, we need to find the ADT from the constructor
			if (isTypeKind(expectedType, 'variable')) {
				// Find which ADT this constructor belongs to
				let foundAdt: string | null = null;
				for (const [adtName, adtInfo] of state.adtRegistry) {
					if (adtInfo.constructors.has(pattern.name)) {
						foundAdt = adtName;
						break;
					}
				}

				if (!foundAdt) {
					throw new Error(`Unknown constructor: ${pattern.name}`);
				}

				// Create the ADT type with fresh type variables for type parameters
				const adtInfo = state.adtRegistry.get(foundAdt)!;
				const typeArgs: Type[] = [];
				const substitution = new Map<string, Type>();
				for (let i = 0; i < adtInfo.typeParams.length; i++) {
					const [freshVar, nextState] = freshTypeVariable(currentState);
					typeArgs.push(freshVar);
					substitution.set(adtInfo.typeParams[i], freshVar);
					currentState = nextState;
				}
				actualType = { kind: 'variant', name: foundAdt, args: typeArgs };

				// Unify the type variable with the ADT type
				currentState = unify(expectedType, actualType, currentState, undefined);
			} else if (!isTypeKind(expectedType, 'variant')) {
				throw new Error(
					`Pattern expects constructor but got ${typeToString(
						expectedType,
						state.substitution
					)}`
				);
			}

			// Look up constructor in ADT registry
			if (!isTypeKind(actualType, 'variant')) {
				throw new Error(
					`Internal error: actualType should be variant but got ${actualType.kind}`
				);
			}
			const adtInfo = state.adtRegistry.get(actualType.name);
			if (!adtInfo) {
				throw new Error(`Unknown ADT: ${actualType.name}`);
			}

			const constructorArgs = adtInfo.constructors.get(pattern.name);
			if (!constructorArgs) {
				throw new Error(
					`Unknown constructor: ${pattern.name} for ADT ${actualType.name}`
				);
			}

			// Create a substitution from type parameters to actual type arguments
			const paramSubstitution = new Map<string, Type>();
			for (let i = 0; i < adtInfo.typeParams.length; i++) {
				paramSubstitution.set(adtInfo.typeParams[i], actualType.args[i]);
			}

			// Substitute type parameters with actual type arguments
			const substitutedArgs = constructorArgs.map(arg =>
				substitute(arg, paramSubstitution)
			);

			// Check argument count
			if (pattern.args.length !== substitutedArgs.length) {
				throw new Error(
					`Constructor ${pattern.name} expects ${substitutedArgs.length} arguments but got ${pattern.args.length}`
				);
			}

			// Type each argument pattern
			for (let i = 0; i < pattern.args.length; i++) {
				const argResult = typePattern(
					pattern.args[i],
					substitutedArgs[i],
					currentState
				);
				currentState = argResult.state;

				// Merge bindings
				for (const [name, type] of argResult.bindings) {
					bindings.set(name, type);
				}
			}

			return { state: currentState, bindings };
		}

		case 'literal': {
			// Literal patterns need to match the expected type
			let literalType: Type;
			if (typeof pattern.value === 'number') {
				literalType = floatType();
			} else if (typeof pattern.value === 'string') {
				literalType = stringType();
			} else {
				throw new Error(`Unsupported literal pattern: ${pattern.value}`);
			}

			const unifiedState = unify(
				expectedType,
				literalType,
				state,
				pattern.location.start
			);
			return { state: unifiedState, bindings };
		}

		case 'tuple': {
			// Validate expected type is tuple
			if (!isTypeKind(expectedType, 'tuple') && !isTypeKind(expectedType, 'variable')) {
				throw new Error(
					`Pattern expects tuple but got ${typeToString(
						expectedType,
						state.substitution
					)}`
				);
			}

			let actualType = expectedType;
			let currentState = state;

			// If expected type is a type variable, create a fresh tuple type
			if (isTypeKind(expectedType, 'variable')) {
				const elementTypes: Type[] = [];
				for (let i = 0; i < pattern.elements.length; i++) {
					const [freshVar, nextState] = freshTypeVariable(currentState);
					elementTypes.push(freshVar);
					currentState = nextState;
				}
				actualType = { kind: 'tuple', elements: elementTypes };

				// Unify the type variable with the tuple type
				currentState = unify(expectedType, actualType, currentState, pattern.location.start);
			}

			if (!isTypeKind(actualType, 'tuple')) {
				throw new Error('Internal error: actualType should be tuple');
			}

			// Check element count
			if (pattern.elements.length !== actualType.elements.length) {
				throw new Error(
					`Tuple pattern expects ${pattern.elements.length} elements but type has ${actualType.elements.length}`
				);
			}

			// Type each element pattern
			for (let i = 0; i < pattern.elements.length; i++) {
				const elementResult = typePattern(
					pattern.elements[i],
					actualType.elements[i],
					currentState
				);
				currentState = elementResult.state;

				// Merge bindings
				for (const [name, type] of elementResult.bindings) {
					bindings.set(name, type);
				}
			}

			return { state: currentState, bindings };
		}

		case 'record': {
			// Validate expected type is record or type variable
			if (!isTypeKind(expectedType, 'record') && !isTypeKind(expectedType, 'variable')) {
				throw new Error(
					`Pattern expects record but got ${typeToString(
						expectedType,
						state.substitution
					)}`
				);
			}

			let actualType = expectedType;
			let currentState = state;

			// If expected type is a type variable, create a fresh record type
			if (isTypeKind(expectedType, 'variable')) {
				const recordFields: { [key: string]: Type } = {};
				for (const field of pattern.fields) {
					const [freshVar, nextState] = freshTypeVariable(currentState);
					recordFields[field.fieldName] = freshVar;
					currentState = nextState;
				}
				actualType = { kind: 'record', fields: recordFields };

				// Unify the type variable with the record type
				currentState = unify(expectedType, actualType, currentState, pattern.location.start);
			}

			if (!isTypeKind(actualType, 'record')) {
				throw new Error('Internal error: actualType should be record');
			}

			// Type each field pattern
			for (const field of pattern.fields) {
				const fieldType = actualType.fields[field.fieldName];
				if (!fieldType) {
					// For duck-typed records, we allow fields that don't exist in the type
					// In this case, we create a fresh type variable for the field
					const [freshVar, nextState] = freshTypeVariable(currentState);
					currentState = nextState;
					
					const fieldResult = typePattern(
						field.pattern,
						freshVar,
						currentState
					);
					currentState = fieldResult.state;

					// Merge bindings
					for (const [name, type] of fieldResult.bindings) {
						bindings.set(name, type);
					}
				} else {
					const fieldResult = typePattern(
						field.pattern,
						fieldType,
						currentState
					);
					currentState = fieldResult.state;

					// Merge bindings
					for (const [name, type] of fieldResult.bindings) {
						bindings.set(name, type);
					}
				}
			}

			return { state: currentState, bindings };
		}

		default:
			throw new Error(`Unsupported pattern kind: ${(pattern as Pattern).kind}`);
	}
};
