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

// Helper to flatten semicolon-separated expressions into a list for iterative processing
const flattenSemicolonSequence = (expr: Expression): Expression[] => {
	if (expr.kind === 'binary' && (expr as any).operator === ';') {
		const binaryExpr = expr as any;
		return [...flattenSemicolonSequence(binaryExpr.left), ...flattenSemicolonSequence(binaryExpr.right)];
	}
	return [expr];
};

// Process a large semicolon sequence iteratively instead of recursively
const decorateSequenceIteratively = (expr: Expression, state: TypeState): [Expression, TypeState] => {
	const statements = flattenSemicolonSequence(expr);
	// Processing statements iteratively
	
	let currentState = state;
	let decoratedStatements: Expression[] = [];
	
	for (let i = 0; i < statements.length; i++) {
		const statement = statements[i];
		const stmtStart = Date.now();
		
		// Use typeExpression directly for better performance, then decorate manually
		const result = typeExpression(statement, currentState);
		statement.type = result.type;
		decoratedStatements.push(statement);
		currentState = result.state;
		
		const stmtTime = Date.now() - stmtStart;
		if (stmtTime > 50) {
			// Statement processed
		}
	}
	
	// Rebuild the binary tree structure but with decorated nodes
	let result = decoratedStatements[decoratedStatements.length - 1];
	for (let i = decoratedStatements.length - 2; i >= 0; i--) {
		result = {
			kind: 'binary',
			operator: ';',
			left: decoratedStatements[i],
			right: result,
			type: result.type
		} as any;
	}
	
	return [result, currentState];
};

// Decorate AST nodes with inferred types (like the class-based typeAndDecorate)
export const typeAndDecorate = (program: Program, initialState?: TypeState) => {
	const start = Date.now();
	
	let state = initialState || createTypeState();
	if (!initialState) {
		const builtinStart = Date.now();
		state = initializeBuiltins(state);
		// Built-ins initialized
		
		const stdlibStart = Date.now();
		state = loadStdlib(state);
		// Standard library loaded
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
	// Processing program statements
	
	// Disabled iterative processing for now due to error
	// if (program.statements.length === 1 && program.statements[0].kind === 'binary' && 
	// 	(program.statements[0] as any).operator === ';') {
	// 	process.stderr.write('Detected large semicolon sequence, using iterative processing\n');
	// 	const [decorated, finalState] = decorateSequenceIteratively(program.statements[0], currentState);
	// 	return {
	// 		program: {
	// 			...program,
	// 			statements: [decorated],
	// 		},
	// 		state: finalState,
	// 	};
	// }
	
	const decorateStart = Date.now();
	const decoratedStatements = program.statements.map((stmt, i) => {
		const stmtStart = Date.now();
		const [decorated, nextState] = decorate(stmt, currentState);
		const stmtTime = Date.now() - stmtStart;
		if (stmtTime > 20) {
			// Statement processed
		}
		currentState = nextState;
		return decorated;
	});
	// Decoration complete

	// Return a decorated program and the final state
	return {
		program: {
			...program,
			statements: decoratedStatements,
		},
		state: currentState,
	};
};