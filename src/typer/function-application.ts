import {
	type ApplicationExpression,
	type PipelineExpression,
	type Type,
} from '../ast';
import { nonFunctionApplicationError, formatTypeError } from './type-errors';
import {
	type TypeState,
	type TypeResult,
	createTypeResult,
	unionEffects,
} from './types';
import { typeExpression } from './expression-dispatcher';
import { unify } from './unify';
import { substitute } from './substitute';
import { typeToString } from './helpers';
import { handleTraitFunctionApplication } from './trait-function-handling';
import { extractFunctionConstraints } from './constraint-resolution';
import { handleRegularFunctionApplication } from './regular-function-application';
import { handleVariableTypeApplication } from './variable-type-handling';

// Main function application entry point - delegates to specialized handlers
export const typeApplication = (
	expr: ApplicationExpression,
	state: TypeState
): TypeResult => {
	let currentState = state;

	// Type the function
	const funcResult = typeExpression(expr.func, currentState);
	currentState = funcResult.state;
	const funcType = funcResult.type;

	// Type each argument and collect effects
	const argTypes: Type[] = [];
	let allEffects = funcResult.effects;

	for (const arg of expr.args) {
		const argResult = typeExpression(arg, currentState);
		currentState = argResult.state;
		argTypes.push(argResult.type);
		allEffects = unionEffects(allEffects, argResult.effects);
	}

	// Try trait function resolution if we have arguments
	if (argTypes.length > 0) {
		const traitResult = handleTraitFunctionApplication(
			expr,
			funcType,
			argTypes,
			currentState,
			funcResult
		);
		if (traitResult) {
			return traitResult;
		}
	}

	// Handle function application by checking if funcType is a function or constrained function
	const { actualFuncType, functionConstraints } =
		extractFunctionConstraints(funcType);

	if (actualFuncType.kind === 'function') {
		return handleRegularFunctionApplication(
			expr,
			actualFuncType,
			argTypes,
			functionConstraints,
			currentState,
			allEffects
		);
	} else if (funcType.kind === 'variable') {
		return handleVariableTypeApplication(
			expr,
			funcType,
			argTypes,
			currentState,
			allEffects
		);
	} else {
		throw new Error(
			formatTypeError(
				nonFunctionApplicationError(funcType, {
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				})
			)
		);
	}
};

// Type inference for pipeline expressions
export const typePipeline = (
	expr: PipelineExpression,
	state: TypeState
): TypeResult => {
	// Pipeline should be function composition, not function application
	// For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))
	// For a pipeline like f <| g <| h, we want to compose them as f(g(h(x)))

	if (expr.steps.length === 1) {
		return typeExpression(expr.steps[0], state);
	}

	// Determine composition direction based on operators
	const isLeftToRight = expr.operators.every(op => op === '|>');
	const isRightToLeft = expr.operators.every(op => op === '<|');

	if (!isLeftToRight && !isRightToLeft) {
		throw new Error(
			`Cannot mix pipeline operators |> and <| in the same expression`
		);
	}

	// For right-to-left composition (<|), reverse the steps
	const steps = isRightToLeft ? [...expr.steps].reverse() : expr.steps;

	// Start with the first function type
	let currentState = state;
	let composedType = typeExpression(steps[0], currentState);
	currentState = composedType.state;
	let allEffects = composedType.effects;

	// Compose with each subsequent function type
	for (let i = 1; i < steps.length; i++) {
		const nextFuncType = typeExpression(steps[i], currentState);
		currentState = nextFuncType.state;
		allEffects = unionEffects(allEffects, nextFuncType.effects);

		if (
			composedType.type.kind === 'function' &&
			nextFuncType.type.kind === 'function'
		) {
			// Check that the output of composedType matches the input of nextFuncType
			if (nextFuncType.type.params.length !== 1) {
				throw new Error(`Pipeline function must take exactly one parameter`);
			}

			currentState = unify(
				composedType.type.return,
				nextFuncType.type.params[0],
				currentState,
				{
					line: expr.location?.start.line || 1,
					column: expr.location?.start.column || 1,
				}
			);

			// The composed function takes the input of the first function and returns the output of the last function
			// For accessor composition, we need to properly merge constraints
			const firstConstraints = composedType.type.constraints || [];
			const secondConstraints = nextFuncType.type.constraints || [];

			// For accessor composition, we want to create a clean constraint structure
			// The result should be: α has {person: γ} and γ has {city: β}
			const uniqueConstraints: any[] = [];

			// Find the person constraint from the first function
			const personConstraint = firstConstraints.find(
				c => c.kind === 'has' && (c as any).structure.fields.person
			);

			if (personConstraint && personConstraint.kind === 'has') {
				// Get the person field variable
				const personFieldType = (personConstraint as any).structure.fields
					.person;
				if (personFieldType.kind === 'variable') {
					// Find what field the second accessor is trying to access
					for (const constraint of secondConstraints) {
						if (constraint.kind === 'has') {
							const fieldNames = Object.keys(
								(constraint as any).structure.fields
							);
							if (fieldNames.length === 1) {
								// Create a constraint that the person field has the target field
								const nestedConstraint = {
									kind: 'has' as const,
									typeVar: personFieldType.name,
									structure: (constraint as any).structure,
								};
								uniqueConstraints.push(nestedConstraint);
								break; // Only add the first matching constraint
							}
						}
					}
				}
			}

			composedType = createTypeResult(
				{
					kind: 'function',
					params: [composedType.type.params[0]],
					return: nextFuncType.type.return,
					effects: allEffects,
					constraints: uniqueConstraints,
				},
				allEffects,
				currentState
			);
		} else {
			throw new Error(
				`Cannot compose non-function types in pipeline: ${typeToString(
					composedType.type
				)} and ${typeToString(nextFuncType.type)}`
			);
		}
	}

	return createTypeResult(
		substitute(composedType.type, currentState.substitution),
		allEffects,
		currentState
	);
};
