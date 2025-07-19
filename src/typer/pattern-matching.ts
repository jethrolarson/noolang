import {
	type TypeDefinitionExpression,
	type MatchExpression,
	type MatchCase,
	type Pattern,
	type Type,
	typeVariable,
	functionType,
	unitType,
	intType,
	stringType,
} from '../ast';
import { 
	type TypeState, 
	type TypeResult, 
	createTypeResult, 
	createPureTypeResult, 
	unionEffects 
} from './types';
import { substitute } from './substitute';
import { unify } from './unify';
import { freshTypeVariable } from './type-operations';
import { typeExpression } from './expression-dispatcher';
import { isTypeKind, typeToString } from './helpers';

// Type inference for ADT type definitions
export const typeTypeDefinition = (
	expr: TypeDefinitionExpression,
	state: TypeState,
): TypeResult => {
	// Register the ADT in the registry first to enable recursive references
	const constructorMap = new Map<string, Type[]>();

	// Pre-register the ADT so recursive references work
	const newRegistry = new Map(state.adtRegistry);
	newRegistry.set(expr.name, {
		typeParams: expr.typeParams,
		constructors: constructorMap, // Will be filled
	});

	// Also add the ADT type constructor to the environment
	const adtType = {
		kind: "variant" as const,
		name: expr.name,
		args: expr.typeParams.map((param) => typeVariable(param)),
	};
	const envWithType = new Map(state.environment);
	envWithType.set(expr.name, {
		type: adtType,
		quantifiedVars: expr.typeParams,
	});

	state = { ...state, adtRegistry: newRegistry, environment: envWithType };

	// Process each constructor
	for (const _constructor of expr.constructors) {
		constructorMap.set(_constructor.name, _constructor.args);

		// Add constructor to environment as a function
		// Constructor type: arg1 -> arg2 -> ... -> ADTType typeParams
		const adtType: Type = {
			kind: "variant",
			name: expr.name,
			args: expr.typeParams.map((param) => typeVariable(param)),
		};

		let constructorType: Type;
		if (_constructor.args.length === 0) {
			// Nullary constructor: just the ADT type
			constructorType = adtType;
		} else {
			// N-ary constructor: function from args to ADT type
			constructorType = functionType(_constructor.args, adtType);
		}

		// Add constructor to environment
		const newEnv = new Map(state.environment);
		newEnv.set(_constructor.name, {
			type: constructorType,
			quantifiedVars: expr.typeParams,
		});
		state = { ...state, environment: newEnv };
	}

	// Update ADT registry with completed constructor map
	const finalRegistry = new Map(state.adtRegistry);
	finalRegistry.set(expr.name, {
		typeParams: expr.typeParams,
		constructors: constructorMap,
	});

	// Type definitions return unit and update state
	return createPureTypeResult(
		unitType(),
		{ ...state, adtRegistry: finalRegistry }
	);
};

// Type inference for match expressions
export const typeMatch = (
	expr: MatchExpression,
	state: TypeState,
): TypeResult => {
	// Type the expression being matched
	const exprResult = typeExpression(expr.expression, state);
	let currentState = exprResult.state;

	// Type each case and ensure they all return the same type
	if (expr.cases.length === 0) {
		throw new Error("Match expression must have at least one case");
	}

	// Type first case to get result type
	const firstCaseResult = typeMatchCase(
		expr.cases[0],
		exprResult.type,
		currentState,
	);
	currentState = firstCaseResult.state;
	let resultType = firstCaseResult.type;
	let allEffects = unionEffects(exprResult.effects, firstCaseResult.effects);

	// Type remaining cases and unify with result type
	for (let i = 1; i < expr.cases.length; i++) {
		const caseResult = typeMatchCase(
			expr.cases[i],
			exprResult.type,
			currentState,
		);
		currentState = caseResult.state;
		allEffects = unionEffects(allEffects, caseResult.effects);

		// Unify case result type with overall result type
		currentState = unify(
			resultType,
			caseResult.type,
			currentState,
			expr.cases[i].location.start,
		);
		resultType = substitute(resultType, currentState.substitution);
	}

	return createTypeResult(resultType, allEffects, currentState);
};

// Type a single match case
const typeMatchCase = (
	matchCase: MatchCase,
	matchedType: Type,
	state: TypeState,
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
	state: TypeState,
): { state: TypeState; bindings: Map<string, Type> } => {
	const bindings = new Map<string, Type>();

	switch (pattern.kind) {
		case "wildcard":
			// Wildcard matches anything, no bindings
			return { state, bindings };

		case "variable":
			// Variable binds to the expected type
			bindings.set(pattern.name, expectedType);
			return { state, bindings };

		case "constructor": {
			// Constructor pattern matching with type variable handling
			let actualType = expectedType;
			let currentState = state;

			// If expected type is a type variable, we need to find the ADT from the constructor
			if (isTypeKind(expectedType, "variable")) {
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
				actualType = { kind: "variant", name: foundAdt, args: typeArgs };

				// Unify the type variable with the ADT type
				currentState = unify(expectedType, actualType, currentState, undefined);
			} else if (!isTypeKind(expectedType, "variant")) {
				throw new Error(
					`Pattern expects constructor but got ${typeToString(
						expectedType,
						state.substitution,
					)}`,
				);
			}

			// Look up constructor in ADT registry
			if (!isTypeKind(actualType, "variant")) {
				throw new Error(
					`Internal error: actualType should be variant but got ${actualType.kind}`,
				);
			}
			const adtInfo = state.adtRegistry.get(actualType.name);
			if (!adtInfo) {
				throw new Error(`Unknown ADT: ${actualType.name}`);
			}

			const constructorArgs = adtInfo.constructors.get(pattern.name);
			if (!constructorArgs) {
				throw new Error(
					`Unknown constructor: ${pattern.name} for ADT ${actualType.name}`,
				);
			}

			// Create a substitution from type parameters to actual type arguments
			const paramSubstitution = new Map<string, Type>();
			for (let i = 0; i < adtInfo.typeParams.length; i++) {
				paramSubstitution.set(adtInfo.typeParams[i], actualType.args[i]);
			}

			// Substitute type parameters with actual type arguments
			const substitutedArgs = constructorArgs.map((arg) =>
				substitute(arg, paramSubstitution),
			);

			// Check argument count
			if (pattern.args.length !== substitutedArgs.length) {
				throw new Error(
					`Constructor ${pattern.name} expects ${substitutedArgs.length} arguments but got ${pattern.args.length}`,
				);
			}

			// Type each argument pattern
			for (let i = 0; i < pattern.args.length; i++) {
				const argResult = typePattern(
					pattern.args[i],
					substitutedArgs[i],
					currentState,
				);
				currentState = argResult.state;

				// Merge bindings
				for (const [name, type] of argResult.bindings) {
					bindings.set(name, type);
				}
			}

			return { state: currentState, bindings };
		}

		case "literal": {
			// Literal patterns need to match the expected type
			let literalType: Type;
			if (typeof pattern.value === "number") {
				literalType = intType();
			} else if (typeof pattern.value === "string") {
				literalType = stringType();
			} else {
				throw new Error(`Unsupported literal pattern: ${pattern.value}`);
			}

			const unifiedState = unify(
				expectedType,
				literalType,
				state,
				pattern.location.start,
			);
			return { state: unifiedState, bindings };
		}

		default:
			throw new Error(`Unsupported pattern kind: ${(pattern as Pattern).kind}`);
	}
};