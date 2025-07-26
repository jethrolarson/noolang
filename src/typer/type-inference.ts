import {
	type Expression,
	type LiteralExpression,
	type VariableExpression,
	type FunctionExpression,
	type BinaryExpression,
	type IfExpression,
	type DefinitionExpression,
	type MutableDefinitionExpression,
	type MutationExpression,
	type ImportExpression,
	type RecordExpression,
	type AccessorExpression,
	type ListExpression,
	type TupleExpression,
	type WhereExpression,
	type TypedExpression,
	type ConstrainedExpression,
	type ConstraintExpr,
	type ConstraintDefinitionExpression,
	type ImplementDefinitionExpression,
	type Type,
	type Constraint,
	intType,
	stringType,
	boolType,
	functionType,
	typeVariable,
	unknownType,
	unitType,
	listTypeWithElement,
	tupleType,
	recordType,
	variantType,
	hasFieldConstraint,
	ApplicationExpression,
} from '../ast';
import {
	undefinedVariableError,
	nonFunctionApplicationError,
} from './type-errors';
import {
	getExprLocation,
	throwTypeError,
	mapSet,
	typeToString,
	propagateConstraintToTypeVariable,
} from './helpers';
import { unify } from './unify';
import { substitute } from './substitute';
import { typeExpression } from './expression-dispatcher';
import {
	type TypeState,
	type TypeResult,
	createPureTypeResult,
	createTypeResult,
	unionEffects,
	emptyEffects,
	// Legacy constraint imports removed
	type TypeScheme,
} from './types';
// NOTE: validateConstraintName import removed - constraint validation disabled
import {
	freshTypeVariable,
	generalize,
	instantiate,
	freshenTypeVariables,
	flattenStatements,
	createConstrainedType,
	addConstraintToType,
} from './type-operations';
// NOTE: Constraint resolution imports removed - trait system will replace
import { typeApplication } from './function-application';
import { isTraitFunction, getTraitFunctionInfo } from './trait-system';

// Note: Main typeExpression is now in expression-dispatcher.ts
// This file only contains the individual type inference functions

// Type inference for literals
export const typeLiteral = (
	expr: LiteralExpression,
	state: TypeState
): TypeResult => {
	const value = expr.value;

	if (typeof value === 'number') {
		return createPureTypeResult(intType(), state);
	} else if (typeof value === 'string') {
		return createPureTypeResult(stringType(), state);
	} else {
		return createPureTypeResult(unknownType(), state);
	}
};

// Type inference for variables
export const typeVariableExpr = (
	expr: VariableExpression,
	state: TypeState
): TypeResult => {
	const scheme = state.environment.get(expr.name);
	if (!scheme) {
		// NEW: Check if this is a trait function before throwing error
		if (isTraitFunction(state.traitRegistry, expr.name)) {
			// Get the trait function's type and constraint information
			const traitInfo = getTraitFunctionInfo(state.traitRegistry, expr.name);
			if (traitInfo) {
				// Create fresh type variables for the trait function type
				const typeVarMapping = new Map<string, Type>();
				
				// Helper function to recursively freshen type variables
				const freshenType = (type: Type, currentState: TypeState): [Type, TypeState] => {
					switch (type.kind) {
						case 'variable': {
							if (!typeVarMapping.has(type.name)) {
								const [freshVar, newState] = freshTypeVariable(currentState);
								typeVarMapping.set(type.name, freshVar);
								return [freshVar, newState];
							}
							return [typeVarMapping.get(type.name)!, currentState];
						}
						case 'function': {
							let currentState2 = currentState;
							const freshenedParams: Type[] = [];
							for (const param of type.params) {
								const [freshenedParam, nextState] = freshenType(param, currentState2);
								freshenedParams.push(freshenedParam);
								currentState2 = nextState;
							}
							const [freshenedReturn, finalState] = freshenType(type.return, currentState2);
							return [functionType(freshenedParams, freshenedReturn, type.effects), finalState];
						}
						case 'variant': {
							// For variant types like "m a", freshen the name and args
							if (!typeVarMapping.has(type.name)) {
								const [freshVar, newState] = freshTypeVariable(currentState);
								typeVarMapping.set(type.name, freshVar);
								
								// Also freshen the args
								let currentState2 = newState;
								const freshenedArgs: Type[] = [];
								for (const arg of type.args) {
									const [freshenedArg, nextState] = freshenType(arg, currentState2);
									freshenedArgs.push(freshenedArg);
									currentState2 = nextState;
								}
								
								// Return a variant type with the fresh variable name and freshened args
								return [{
									kind: 'variant',
									name: (freshVar as any).name, // Use the fresh variable name
									args: freshenedArgs
								}, currentState2];
							} else {
								// Use existing mapping
								const existingVar = typeVarMapping.get(type.name)!;
								let currentState2 = currentState;
								const freshenedArgs: Type[] = [];
								for (const arg of type.args) {
									const [freshenedArg, nextState] = freshenType(arg, currentState2);
									freshenedArgs.push(freshenedArg);
									currentState2 = nextState;
								}
								
								return [{
									kind: 'variant',
									name: (existingVar as any).name,
									args: freshenedArgs
								}, currentState2];
							}
						}
						default:
							return [type, currentState];
					}
				};
				
				const [freshenedType, state1] = freshenType(traitInfo.functionType, state);
				
				// Create constraints for any type variables that correspond to the trait type parameter
				// We need to find which freshened type variable corresponds to the original trait type parameter
				const constraintsMap = new Map<string, Array<{ kind: 'implements'; trait: string }>>();
				
				// Find the freshened type variable that corresponds to the trait type parameter
				const traitTypeParamVar = typeVarMapping.get(traitInfo.typeParam);
				if (traitTypeParamVar && traitTypeParamVar.kind === 'variable') {
					constraintsMap.set(traitTypeParamVar.name, [{ kind: 'implements', trait: traitInfo.traitName }]);
				}

				
				// If we have constraints, create a ConstrainedType
				if (constraintsMap.size > 0) {
					const constrainedType = createConstrainedType(freshenedType, constraintsMap);
					return createPureTypeResult(constrainedType, state1);
				} else {
					return createPureTypeResult(freshenedType, state1);
				}
			}
			
			// Fallback: return a generic function type if trait info not found
			const [argType, state1] = freshTypeVariable(state);
			const [returnType, state2] = freshTypeVariable(state1);
			const traitFunctionType = functionType([argType], returnType, emptyEffects());
			return createPureTypeResult(traitFunctionType, state2);
		}
		
		throwTypeError(
			location => undefinedVariableError(expr.name, location),
			getExprLocation(expr)
		);
	}

	const [instantiatedType, newState] = instantiate(scheme, state);

	// Handle effects from TypeScheme
	const effects = scheme.effects || emptyEffects();
	return createTypeResult(instantiatedType, effects, newState);
};

// Helper function to count parameters in a function type
const countFunctionParams = (type: Type): number => {
	if (type.kind !== 'function') return 0;
	return type.params.length + countFunctionParams(type.return);
};

// Flatten a constraint expression into a list of atomic constraints
const flattenConstraintExpr = (expr: ConstraintExpr): Constraint[] => {
	switch (expr.kind) {
		case 'is':
			// NOTE: Constraint name validation removed
			return [expr];
		case 'hasField':
		case 'implements':
		case 'custom':
			return [expr];
		case 'and':
			return [
				...flattenConstraintExpr(expr.left),
				...flattenConstraintExpr(expr.right),
			];
		case 'or':
			return [
				...flattenConstraintExpr(expr.left),
				...flattenConstraintExpr(expr.right),
			];
		case 'paren':
			return flattenConstraintExpr(expr.expr);
		default:
			return [];
	}
};

// Collect free variables used in an expression
const collectFreeVars = (
	expr: Expression,
	boundVars: Set<string> = new Set()
): Set<string> => {
	const freeVars = new Set<string>();

	const walk = (e: Expression, bound: Set<string>) => {
		switch (e.kind) {
			case 'variable':
				if (!bound.has(e.name)) {
					freeVars.add(e.name);
				}
				break;
			case 'function': {
				// Parameters are bound in the function body
				const newBound = new Set([...bound, ...e.params]);
				walk(e.body, newBound);
				break;
			}
			case 'definition': {
				// The defined name is bound for the value expression
				const defBound = new Set([...bound, e.name]);
				walk(e.value, defBound);
				break;
			}
			case 'application':
				walk(e.func, bound);
				e.args.forEach(arg => walk(arg, bound));
				break;
			case 'binary':
				walk(e.left, bound);
				walk(e.right, bound);
				// Operator is also a free variable
				if (!bound.has(e.operator)) {
					freeVars.add(e.operator);
				}
				break;
			case 'if':
				walk(e.condition, bound);
				walk(e.then, bound);
				walk(e.else, bound);
				break;
			case 'match':
				walk(e.expr, bound);
				e.cases.forEach(matchCase => {
					// Pattern variables are bound in the case body
					const patternVars = new Set<string>();
					// Extract pattern variables (simplified - should handle all pattern types)
					const extractPatternVars = (pattern: any) => {
						if (pattern && pattern.kind === 'variable') {
							patternVars.add(pattern.name);
						}
						// Handle other pattern types as needed
					};
					extractPatternVars(matchCase.pattern);
					const caseBound = new Set([...bound, ...patternVars]);
					walk(matchCase.body, caseBound);
				});
				break;
			// Add other expression types as needed
			default:
				// For other types, recursively walk any sub-expressions
				// This is a simplified approach - in practice you'd handle each type
				break;
		}
	};

	walk(expr, boundVars);
	return freeVars;
};

// Update typeFunction to use closure culling
export const typeFunction = (
	expr: FunctionExpression,
	state: TypeState
): TypeResult => {
	// Collect free variables used in the function body
	const boundParams = new Set(expr.params);
	const freeVars = collectFreeVars(expr.body, boundParams);

	// Create a minimal environment with only what's needed
	const functionEnv = new Map<string, any>();

	// Always include built-ins and stdlib essentials
	const essentials = [
		'+', '-', '*', '/', '==', '!=', '<', '>', '<=', '>=',
		'|', '|>', '<|', ';', '$', 'if',
		'length', 'head', 'tail', 'map', 'filter', 'reduce', 'isEmpty', 'append',
		'concat', 'toString', 'abs', 'max', 'min',
		'print', 'println', 'readFile', 'writeFile', 'log', 'random', 'randomRange',
		'mutSet', 'mutGet', 'hasKey', 'hasValue', 'set', 'tupleLength', 'tupleIsEmpty', 'list_get',
		'True', 'False', 'None', 'Some', 'Ok', 'Err', 'Bool', 'Option', 'Result',
		'not', // Add not to essentials for Bool operations
	];
	for (const essential of essentials) {
		if (state.environment.has(essential)) {
			functionEnv.set(essential, state.environment.get(essential)!);
		}
	}

	// Include only the free variables actually used
	for (const freeVar of freeVars) {
		if (state.environment.has(freeVar)) {
			functionEnv.set(freeVar, state.environment.get(freeVar)!);
		}
	}

	let currentState = { ...state, environment: functionEnv };

	const paramTypes: Type[] = [];
	for (const param of expr.params) {
		const [paramType, nextState] = freshTypeVariable(currentState);
		functionEnv.set(param, { type: paramType, quantifiedVars: [] });
		paramTypes.push(paramType);
		currentState = { ...nextState, environment: functionEnv };
	}

	// Type the function body with the function-local environment
	const bodyResult = typeExpression(expr.body, currentState);
	currentState = bodyResult.state;

	// Decorate the function body with its inferred type
	expr.body.type = bodyResult.type;

	// Restore the original environment for the outer scope
	currentState = { ...currentState, environment: state.environment };

	// Special handling for constrained function bodies
	let funcType: Type;

	if (expr.body.kind === 'constrained') {
		const constrainedBody = expr.body as ConstrainedExpression;
		const constraints = flattenConstraintExpr(constrainedBody.constraint);

		// If the constrained body has an explicit function type, use it as the innermost type
		if (constrainedBody.type.kind === 'function') {
			funcType = constrainedBody.type;

			// Apply constraints to this function type
			if (constraints.length > 0) {
				funcType.constraints = constraints;
				// Store the original constraint expression for display purposes
				(funcType as any).originalConstraint = constrainedBody.constraint;

				// CRITICAL: Also propagate constraints to type variables in parameters
				// This ensures constraint validation works during function application
				for (const constraint of constraints) {
					if (constraint.kind === 'is') {
						propagateConstraintToTypeVariable(funcType, constraint);
					}
				}
			}

			// If we have more parameters than the explicit type accounts for, wrap it
			const explicitParamCount = countFunctionParams(constrainedBody.type);
			const actualParamCount = paramTypes.length;
			if (actualParamCount > explicitParamCount) {
				// Wrap the explicit function type with additional parameter layers
				for (let i = actualParamCount - explicitParamCount - 1; i >= 0; i--) {
					funcType = functionType([paramTypes[i]], funcType);
				}
			}
		} else {
			// Build function type normally and apply constraints
			funcType = bodyResult.type;
			for (let i = paramTypes.length - 1; i >= 0; i--) {
				funcType = functionType([paramTypes[i]], funcType);
			}
			if (constraints.length > 0 && funcType.kind === 'function') {
				funcType.constraints = constraints;
			}
		}
	} else {
		// Build the function type normally
		funcType = bodyResult.type;
		for (let i = paramTypes.length - 1; i >= 0; i--) {
			funcType = functionType([paramTypes[i]], funcType);
		}
	}

	return createTypeResult(funcType, bodyResult.effects, currentState);
};

// Type inference for definitions
export const typeDefinition = (
	expr: DefinitionExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Add placeholder for recursion before inferring the value
	const [placeholderType, newState] = freshTypeVariable(currentState);
	currentState = newState;

	const tempEnv = mapSet(currentState.environment, expr.name, {
		type: placeholderType,
		quantifiedVars: [],
	});
	currentState = { ...currentState, environment: tempEnv };

	// Type the value
	const valueResult = typeExpression(expr.value, currentState);
	currentState = valueResult.state;

	// Decorate the value with its inferred type
	expr.value.type = valueResult.type;

	// Unify placeholder with actual type for recursion
	currentState = unify(
		placeholderType,
		valueResult.type,
		currentState,
		getExprLocation(expr)
	);

	// Remove the just-defined variable from the environment for generalization
	const envForGen = new Map(currentState.environment);
	envForGen.delete(expr.name);

	// Generalize the type before storing in the environment (apply substitution!)
	const scheme = generalize(
		valueResult.type,
		envForGen,
		currentState.substitution
	);

	// Add to environment with generalized type
	const finalEnv = mapSet(currentState.environment, expr.name, scheme);
	currentState = { ...currentState, environment: finalEnv };

	// Freshen type variables for the definition's value (thread state)
	const [finalType, finalState] = freshenTypeVariables(
		valueResult.type,
		new Map(),
		currentState
	);
	return createTypeResult(finalType, valueResult.effects, finalState);
};

// Type inference for if expressions
export const typeIf = (expr: IfExpression, state: TypeState): TypeResult => {
	let currentState = state;

	// Type condition
	const conditionResult = typeExpression(expr.condition, currentState);
	currentState = conditionResult.state;

	// Unify condition with boolean
	currentState = unify(
		conditionResult.type,
		boolType(),
		currentState,
		getExprLocation(expr)
	);

	// Type then branch
	const thenResult = typeExpression(expr.then, currentState);
	currentState = thenResult.state;

	// Type else branch
	const elseResult = typeExpression(expr.else, currentState);
	currentState = elseResult.state;

	// Unify then and else types
	currentState = unify(
		thenResult.type,
		elseResult.type,
		currentState,
		getExprLocation(expr)
	);

	// Apply substitution to get final type
	const finalType = substitute(thenResult.type, currentState.substitution);

	return createTypeResult(
		finalType,
		unionEffects(
			conditionResult.effects,
			thenResult.effects,
			elseResult.effects
		),
		currentState
	);
};

// Type inference for binary expressions
export const typeBinary = (
	expr: BinaryExpression,
	state: TypeState
): TypeResult => {
	// Special handling for semicolon operator (sequence) - flatten to avoid O(n²) re-evaluation
	if (expr.operator === ';') {
		// Flatten the semicolon sequence and process each statement exactly once
		const statements = flattenStatements(expr);
		let currentState = state;
		let finalType = null;
		let allEffects = emptyEffects();

		for (const statement of statements) {
			const result = typeExpression(statement, currentState);
			currentState = result.state;
			finalType = result.type;
			allEffects = unionEffects(allEffects, result.effects);
		}

		return createTypeResult(finalType || unitType(), allEffects, currentState);
	}

	let currentState = state;

	// Type left operand
	const leftResult = typeExpression(expr.left, currentState);
	currentState = leftResult.state;

	// Type right operand
	const rightResult = typeExpression(expr.right, currentState);
	currentState = rightResult.state;

	// Special handling for thrush operator (|) - function application
	if (expr.operator === '|') {
		// Thrush: a | b means b(a) - apply right function to left value
		if (rightResult.type.kind !== 'function') {
			throwTypeError(
				location => nonFunctionApplicationError(rightResult.type, location),
				getExprLocation(expr)
			);
		}

		// Check that the function can take the left value as its first argument
		if (rightResult.type.params.length < 1) {
			throw new Error(
				`Thrush operator requires function with at least one parameter, got ${rightResult.type.params.length}`
			);
		}

		currentState = unify(
			rightResult.type.params[0],
			leftResult.type,
			currentState,
			getExprLocation(expr)
		);

		// Return the function's return type (which may be a partially applied function)
		return createTypeResult(
			rightResult.type.return,
			unionEffects(leftResult.effects, rightResult.effects),
			currentState
		);
	}

	// Special handling for dollar operator ($) - low precedence function application
	if (expr.operator === '$') {
		// Dollar: a $ b means a(b) - apply left function to right value
		// Delegate to the same logic as regular function application

		// Create a synthetic ApplicationExpression for a $ b
		const syntheticApp: ApplicationExpression = {
			kind: 'application',
			func: expr.left,
			args: [expr.right],
			location: expr.location,
		};

		return typeApplication(syntheticApp, currentState);
	}

	// Special handling for safe thrush operator (|?) - desugar to bind call
	if (expr.operator === '|?') {
		// Safe thrush: a |? f desugars to: bind a f
		// Transform this into a function application and let constraint resolution handle it

		if (rightResult.type.kind !== 'function') {
			throwTypeError(
				location => nonFunctionApplicationError(rightResult.type, location),
				getExprLocation(expr)
			);
		}

		// Check that the function can take one parameter
		if (rightResult.type.params.length !== 1) {
			throw new Error(
				`Safe thrush operator requires function with exactly one parameter, got ${rightResult.type.params.length}`
			);
		}

		// Try constraint resolution first, fall back to direct implementation
		try {
			// Create a synthetic function application: bind(left)(right)

			const bindVar: VariableExpression = {
				kind: 'variable',
				name: 'bind',
				location: expr.location,
			};

			const syntheticApp: ApplicationExpression = {
				kind: 'application',
				func: bindVar,
				args: [expr.left, expr.right],
				location: expr.location,
			};

			// This will trigger constraint resolution for 'bind'
			return typeApplication(syntheticApp, currentState);
		} catch (error) {
			// If constraint resolution fails, fall back to direct implementation for known monads
			if (
				leftResult.type.kind === 'variant' &&
				leftResult.type.args.length >= 1
			) {
				const monadName = leftResult.type.name;
				const innerType = leftResult.type.args[0];

				if (monadName === 'Option' || monadName === 'Result') {
					// Unify the function parameter with the inner type
					currentState = unify(
						rightResult.type.params[0],
						innerType,
						currentState,
						getExprLocation(expr)
					);

					// The result type follows monadic bind semantics
					let resultType: Type;
					if (
						rightResult.type.return.kind === 'variant' &&
						rightResult.type.return.name === monadName
					) {
						// Function returns same monad type -> bind flattens
						resultType = rightResult.type.return;
					} else {
						// Function returns T -> wrap in the monad
						if (monadName === 'Option') {
							resultType = variantType('Option', [rightResult.type.return]);
						} else if (
							monadName === 'Result' &&
							leftResult.type.args.length === 2
						) {
							// Preserve error type for Result
							resultType = variantType('Result', [
								rightResult.type.return,
								leftResult.type.args[1],
							]);
						} else {
							resultType = variantType(monadName, [rightResult.type.return]);
						}
					}

					return createTypeResult(
						resultType,
						unionEffects(leftResult.effects, rightResult.effects),
						currentState
					);
				}
			}

			// Re-throw the original error if we can't handle it
			throw error;
		}
	}

	// Get operator type from environment
	const operatorScheme = currentState.environment.get(expr.operator);
	if (!operatorScheme) {
		throw new Error(`Unknown operator: ${expr.operator}`);
	}

	const [operatorType, newState] = instantiate(operatorScheme, currentState);
	currentState = newState;

	// Create fresh type variable for result
	const [resultType, finalState] = freshTypeVariable(currentState);
	currentState = finalState;

	// Build expected function type
	const expectedType = functionType(
		[leftResult.type, rightResult.type],
		resultType
	);

	// Unify operator type with expected type
	currentState = unify(
		operatorType,
		expectedType,
		currentState,
		getExprLocation(expr),
		{
			reason: 'operator_application',
			operation: `applying operator ${expr.operator}`,
			hint: `The ${
				expr.operator
			} operator expects compatible operand types. Left operand: ${typeToString(
				leftResult.type,
				currentState.substitution
			)}, Right operand: ${typeToString(
				rightResult.type,
				currentState.substitution
			)}.`,
		}
	);

	// Apply substitution to get final result type
	const [finalResultType, finalResultState] = freshenTypeVariables(
		resultType,
		new Map(),
		currentState
	);

	return createTypeResult(
		finalResultType,
		unionEffects(leftResult.effects, rightResult.effects),
		finalResultState
	);
};

// Type inference for mutable definitions
export const typeMutableDefinition = (
	expr: MutableDefinitionExpression,
	state: TypeState
): TypeResult => {
	// Handle mutable definitions similar to regular definitions
	const valueResult = typeExpression(expr.value, state);
	const newEnv = mapSet(state.environment, expr.name, {
		type: valueResult.type,
		quantifiedVars: [],
	});
	return createTypeResult(valueResult.type, valueResult.effects, {
		...valueResult.state,
		environment: newEnv,
	});
};

// Type inference for mutations
export const typeMutation = (
	expr: MutationExpression,
	state: TypeState
): TypeResult => {
	// For mutations, we need to check that the target exists and the value type matches
	const targetScheme = state.environment.get(expr.target);
	if (!targetScheme) {
		throwTypeError(
			location => undefinedVariableError(expr.target, location),
			getExprLocation(expr)
		);
	}

	const valueResult = typeExpression(expr.value, state);
	const newState = unify(
		targetScheme.type,
		valueResult.type,
		valueResult.state,
		getExprLocation(expr)
	);

	return createTypeResult(unitType(), valueResult.effects, newState); // Mutations return unit
};

// Type inference for imports
export const typeImport = (
	expr: ImportExpression,
	state: TypeState
): TypeResult => {
	// For now, assume imports return a record type
	return createPureTypeResult(recordType({}), state);
};

// Type inference for records
export const typeRecord = (
	expr: RecordExpression,
	state: TypeState
): TypeResult => {
	const fields: { [key: string]: Type } = {};
	let currentState = state;
	let allEffects = emptyEffects();

	for (const field of expr.fields) {
		const fieldResult = typeExpression(field.value, currentState);
		fields[field.name] = fieldResult.type;
		currentState = fieldResult.state;
		allEffects = unionEffects(allEffects, fieldResult.effects);
	}

	return createTypeResult(recordType(fields), allEffects, currentState);
};

// Type inference for accessors
export const typeAccessor = (
	expr: AccessorExpression,
	state: TypeState
): TypeResult => {
	// Check cache first
	const fieldName = expr.field;
	const cachedType = state.accessorCache.get(fieldName);
	if (cachedType) {
		return createPureTypeResult(cachedType, state);
	}

	// Accessors return functions that take any record with the required field and return the field type
	// @bar should have type {bar: a, ...} -> a (allows extra fields)
	// Use a fresh type variable for the field type
	const [fieldType, nextState] = freshTypeVariable(state);
	// Create a simple type variable for the record (no constraints on the variable itself)
	const [recordVar, finalState] = freshTypeVariable(nextState);
	// Create a function type with constraints attached to the function type
	const funcType = functionType([recordVar], fieldType);
	// Add the constraint directly to the parameter variable
	if (recordVar.kind === 'variable') {
		recordVar.constraints = [
			hasFieldConstraint(recordVar.name, fieldName, fieldType),
		];
	}

	// Cache the result for future use
	const resultState = {
		...finalState,
		accessorCache: new Map(finalState.accessorCache).set(fieldName, funcType),
	};

	return createPureTypeResult(funcType, resultState);
};

// Type inference for tuples
export const typeTuple = (
	expr: TupleExpression,
	state: TypeState
): TypeResult => {
	const elements: Type[] = [];
	let currentState = state;
	let allEffects = emptyEffects();

	for (const element of expr.elements) {
		const elementResult = typeExpression(element, currentState);
		elements.push(elementResult.type);
		currentState = elementResult.state;
		allEffects = unionEffects(allEffects, elementResult.effects);
	}

	return createTypeResult(tupleType(elements), allEffects, currentState);
};

// Type inference for lists
export const typeList = (
	expr: ListExpression,
	state: TypeState
): TypeResult => {
	if (expr.elements.length === 0) {
		// Empty list - we can't infer the element type
		return createPureTypeResult(listTypeWithElement(typeVariable('a')), state);
	}

	// Infer the type from the first element
	let currentState = state;
	const firstElementResult = typeExpression(expr.elements[0], currentState);
	currentState = firstElementResult.state;
	const firstElementType = firstElementResult.type;
	let allEffects = firstElementResult.effects;

	// Check that all elements have the same type
	for (let i = 1; i < expr.elements.length; i++) {
		const elementResult = typeExpression(expr.elements[i], currentState);
		currentState = elementResult.state;
		allEffects = unionEffects(allEffects, elementResult.effects);
		currentState = unify(firstElementType, elementResult.type, currentState, {
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		});
	}

	// Apply substitution to get the resolved element type
	const resolvedElementType = substitute(
		firstElementType,
		currentState.substitution
	);
	return createTypeResult(
		listTypeWithElement(resolvedElementType),
		allEffects,
		currentState
	);
};

// Type inference for where expressions
export const typeWhere = (
	expr: WhereExpression,
	state: TypeState
): TypeResult => {
	// Create a new type environment with the where-clause definitions
	let whereEnv = new Map(state.environment);
	let currentState = { ...state, environment: whereEnv };

	// Type all definitions in the where clause
	for (const def of expr.definitions) {
		if ((def as DefinitionExpression).kind === 'definition') {
			const definitionDef = def as DefinitionExpression;
			const valueResult = typeExpression(definitionDef.value, currentState);
			currentState = valueResult.state;

			// Generalize with respect to the current whereEnv (excluding the new binding)
			const tempEnv = new Map(currentState.environment);
			tempEnv.delete(definitionDef.name);
			const scheme = generalize(
				valueResult.type,
				tempEnv,
				currentState.substitution
			);

			whereEnv = mapSet(currentState.environment, definitionDef.name, scheme);
			currentState = { ...currentState, environment: whereEnv };
		} else if (
			(def as MutableDefinitionExpression).kind === 'mutable-definition'
		) {
			const mutableDef = def as MutableDefinitionExpression;
			const valueResult = typeExpression(mutableDef.value, currentState);
			currentState = valueResult.state;

			whereEnv = mapSet(currentState.environment, mutableDef.name, {
				type: valueResult.type,
				quantifiedVars: [],
			});
			currentState = { ...currentState, environment: whereEnv };
		}
	}

	// Type the main expression
	const resultResult = typeExpression(expr.main, currentState);

	return createTypeResult(
		resultResult.type,
		resultResult.effects,
		resultResult.state
	);
};

// Type inference for typed expressions
export const typeTyped = (
	expr: TypedExpression,
	state: TypeState
): TypeResult => {
	// For typed expressions, validate that the explicit type matches the inferred type
	const inferredResult = typeExpression(expr.expression, state);
	const explicitType = expr.type;

	const newState = unify(
		inferredResult.type,
		explicitType,
		inferredResult.state,
		{
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		}
	);

	return createTypeResult(explicitType, inferredResult.effects, newState); // Use the explicit type
};

// Type inference for constrained expressions
export const typeConstrained = (
	expr: ConstrainedExpression,
	state: TypeState
): TypeResult => {
	// For constrained expressions, validate that the explicit type matches the inferred type
	const inferredResult = typeExpression(expr.expression, state);
	const explicitType = expr.type;

	const currentState = unify(
		inferredResult.type,
		explicitType,
		inferredResult.state,
		{
			line: expr.location?.start.line || 1,
			column: expr.location?.start.column || 1,
		}
	);

	// Special case: if this constrained expression is inside a function body,
	// the constraint should apply to the function type, not to this expression
	// For now, we'll just return the explicit type without applying constraints here
	// The constraint will be handled at the function level

	// Return the explicit type without constraints applied
	return createTypeResult(explicitType, inferredResult.effects, currentState);
};

// Type constraint definition
export const typeConstraintDefinition = (
	expr: ConstraintDefinitionExpression,
	state: TypeState
): TypeResult => {
	const { name, typeParams, functions } = expr;

	// Create trait definition
	const functionMap = new Map<string, Type>();

	for (const func of functions) {
		// Type the function signature, substituting the constraint type parameter
		const funcType = func.type;
		functionMap.set(func.name, funcType);
	}

	const traitDef = {
		name,
		typeParam: typeParams.length > 0 ? typeParams[0] : 'a', // Use first type param or default to 'a'
		functions: functionMap,
	};

	// Add to trait registry using the new trait system
	const { addTraitDefinition } = require('./trait-system');
	addTraitDefinition(state.traitRegistry, traitDef);

	// Constraint definitions have unit type
	return createPureTypeResult(unitType(), state);
};

// Type implement definition
export const typeImplementDefinition = (
	expr: ImplementDefinitionExpression,
	state: TypeState
): TypeResult => {
	const { constraintName, typeExpr, implementations, givenConstraints } = expr;

	// Extract type name from type expression - support all type kinds
	const { getTypeName } = require('./trait-system');
	const typeName = getTypeName(typeExpr);

	// Check if trait exists in trait registry
	const traitDef = state.traitRegistry.definitions.get(constraintName);
	if (!traitDef) {
		throw new Error(`Trait '${constraintName}' not defined`);
	}

	// Type each implementation and store as expressions
	const implementationMap = new Map<string, Expression>();
	let currentState = state;
	let allEffects = emptyEffects();

	for (const impl of implementations) {
		// Check if function is required by trait
		const requiredType = traitDef.functions.get(impl.name);
		if (!requiredType) {
			throw new Error(
				`Function '${impl.name}' not required by trait '${constraintName}'`
			);
		}

		// Type the implementation to ensure it's valid
		const implResult = typeExpression(impl.value, currentState);
		currentState = implResult.state;
		allEffects = unionEffects(allEffects, implResult.effects);

		// TODO: Check that implementation type matches required type
		// For now, we'll trust the implementation

		// Store the expression (not the type scheme)
		implementationMap.set(impl.name, impl.value);
	}

	// Check that all required functions are implemented
	for (const [funcName] of traitDef.functions) {
		if (!implementationMap.has(funcName)) {
			throw new Error(
				`Missing implementation for '${funcName}' in implementation of '${constraintName}' for '${typeName}'`
			);
		}
	}

	// Create trait implementation
	const traitImpl = {
		typeName,
		functions: implementationMap,
		givenConstraints, // Include given constraints if present
	};

	// Add to trait registry using the new trait system
	const { addTraitImplementation } = require('./trait-system');
	addTraitImplementation(currentState.traitRegistry, constraintName, traitImpl);

	// Implement definitions have unit type
	return createTypeResult(unitType(), allEffects, currentState);
};
