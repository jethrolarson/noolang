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
import {
	typeLiteral,
	typeVariableExpr,
	typeFunction,
	typeDefinition,
	typeMutableDefinition,
	typeMutation,
	typeImport,
	typeRecord,
	typeAccessor,
	typeList,
	typeTuple,
	typeWhere,
	typeTyped,
	typeConstrained,
	typeIf,
	typeBinary,
} from './type-inference';
import { typeApplication, typePipeline } from './function-application';
import { typeMatch, typeTypeDefinition } from './pattern-matching';

// Decorate AST nodes with inferred types (like the class-based typeAndDecorate)
export const typeAndDecorate = (program: Program, initialState?: TypeState) => {
	let state = initialState || createTypeState();
	if (!initialState) {
		state = initializeBuiltins(state);
		state = loadStdlib(state);
	}

	// Helper to recursively decorate expressions
	function decorate(
		expr: Expression,
		state: TypeState
	): [Expression, TypeState] {
		switch (expr.kind) {
			case 'literal': {
				const result = typeLiteral(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'variable': {
				const result = typeVariableExpr(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'function': {
				// Let typeFunction handle the environment and decoration
				const result = typeFunction(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'application': {
				// Decorate func and args
				const [decoratedFunc, funcState] = decorate(expr.func, state);
				expr.func = decoratedFunc;
				let currentState = funcState;
				expr.args = expr.args.map(arg => {
					const [decoratedArg, argState] = decorate(arg, currentState);
					currentState = argState;
					return decoratedArg;
				});
				const result = typeApplication(expr, currentState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'pipeline': {
				// Decorate steps
				let currentState = state;
				expr.steps = expr.steps.map(step => {
					const [decoratedStep, stepState] = decorate(step, currentState);
					currentState = stepState;
					return decoratedStep;
				});
				const result = typePipeline(expr, currentState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'binary': {
				// Decorate left and right
				const [decoratedLeft, leftState] = decorate(expr.left, state);
				expr.left = decoratedLeft;
				const [decoratedRight, rightState] = decorate(expr.right, leftState);
				expr.right = decoratedRight;
				const result = typeBinary(expr, rightState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'if': {
				// Decorate condition, then, else
				const [decoratedCond, condState] = decorate(expr.condition, state);
				expr.condition = decoratedCond;
				const [decoratedThen, thenState] = decorate(expr.then, condState);
				expr.then = decoratedThen;
				const [decoratedElse, elseState] = decorate(expr.else, thenState);
				expr.else = decoratedElse;
				const result = typeIf(expr, elseState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'definition': {
				// Let typeDefinition handle the environment and decoration
				const result = typeDefinition(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'mutable-definition': {
				// Decorate value
				const [decoratedValue, valueState] = decorate(expr.value, state);
				expr.value = decoratedValue;
				const result = typeMutableDefinition(expr, valueState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'mutation': {
				// Decorate value
				const [decoratedValue, valueState] = decorate(expr.value, state);
				expr.value = decoratedValue;
				const result = typeMutation(expr, valueState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'import': {
				const result = typeImport(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'record': {
				// Decorate fields
				let currentState = state;
				expr.fields = expr.fields.map(field => {
					const [decoratedValue, valueState] = decorate(
						field.value,
						currentState
					);
					currentState = valueState;
					return { ...field, value: decoratedValue };
				});
				const result = typeRecord(expr, currentState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'accessor': {
				const result = typeAccessor(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'list': {
				// Decorate elements
				let currentState = state;
				expr.elements = expr.elements.map(el => {
					const [decoratedEl, elState] = decorate(el, currentState);
					currentState = elState;
					return decoratedEl;
				});
				const result = typeList(expr, currentState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'tuple': {
				// Decorate elements
				let currentState = state;
				expr.elements = expr.elements.map(el => {
					const [decoratedEl, elState] = decorate(el, currentState);
					currentState = elState;
					return decoratedEl;
				});
				const result = typeTuple(expr, currentState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'where': {
				// Decorate definitions
				let currentState = state;
				expr.definitions = expr.definitions.map(def => {
					const [decoratedDef, defState] = decorate(def, currentState);
					currentState = defState;
					return decoratedDef as
						| DefinitionExpression
						| MutableDefinitionExpression;
				});
				const [decoratedMain, mainState] = decorate(expr.main, currentState);
				expr.main = decoratedMain;
				const result = typeWhere(expr, mainState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'unit': {
				expr.type = unitType();
				return [expr, state];
			}
			case 'typed': {
				// Decorate inner expression
				const [decoratedExpr, exprState] = decorate(expr.expression, state);
				expr.expression = decoratedExpr;
				const result = typeTyped(expr, exprState);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'type-definition': {
				const result = typeTypeDefinition(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'match': {
				const result = typeMatch(expr, state);
				expr.type = result.type;
				return [expr, result.state];
			}
			case 'constrained': {
				const [decoratedExpr, exprState] = decorate(expr.expression, state);
				expr.expression = decoratedExpr;
				const result = typeConstrained(expr, exprState);
				expr.type = result.type;
				return [expr, result.state];
			}
			default:
				throw new Error(
					`Unknown expression kind: ${(expr as Expression).kind}`
				);
		}
	}

	// Decorate all top-level statements
	let currentState = state;
	const decoratedStatements = program.statements.map(stmt => {
		const [decorated, nextState] = decorate(stmt, currentState);
		currentState = nextState;
		return decorated;
	});

	// Return a decorated program and the final state
	return {
		program: {
			...program,
			statements: decoratedStatements,
		},
		state: currentState,
	};
};