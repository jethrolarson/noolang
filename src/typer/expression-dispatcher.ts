import {
	type Expression,
	unitType,
} from '../ast';
import { type TypeState, type TypeResult, createPureTypeResult } from './types';
import {
	typeLiteral,
	typeVariableExpr,
	typeFunction,
	typeDefinition,
	typeIf,
	typeBinary,
	typeMutableDefinition,
	typeMutation,
	typeImport,
	typeRecord,
	typeAccessor,
	typeTuple,
	typeList,
	typeWhere,
	typeTyped,
	typeConstrained,
} from './type-inference';
import {
	typeApplication,
	typePipeline,
} from './function-application';
import {
	typeMatch,
	typeTypeDefinition,
} from './pattern-matching';

// Expression typing tracking
let expressionTypeCount = 0;
let expressionKindCounts = new Map<string, number>();
let expressionPatterns = new Map<string, number>();

const getExpressionPattern = (expr: Expression): string => {
	switch (expr.kind) {
		case 'literal':
			return `lit:${(expr as any).value}`;
		case 'variable':
			return `var:${(expr as any).name}`;
		case 'function':
			return `fn:${(expr as any).params?.length || 0}p`;
		case 'application':
			return `app`;
		case 'binary':
			return `bin:${(expr as any).operator}`;
		case 'list':
			return `list:${(expr as any).elements?.length || 0}e`;
		case 'record':
			const fields = (expr as any).fields || {};
			return `rec:${Object.keys(fields).length}f`;
		default:
			return expr.kind;
	}
};

// Main type inference dispatcher
export const typeExpression = (
	expr: Expression,
	state: TypeState
): TypeResult => {
	// Track expression typing frequency
	expressionTypeCount++;
	const kind = expr.kind;
	const pattern = getExpressionPattern(expr);
	
	expressionKindCounts.set(kind, (expressionKindCounts.get(kind) || 0) + 1);
	expressionPatterns.set(pattern, (expressionPatterns.get(pattern) || 0) + 1);
	
	// Track call stack for definitions to see where re-typing comes from
	if (kind === 'definition' && expressionPatterns.get(pattern)! > 1) {
		const stack = new Error().stack || '';
		const callers = stack.split('\n').slice(2, 5).map(line => 
			line.includes('at ') ? line.split('at ')[1].split('(')[0].trim() : 'unknown'
		);
		if (expressionPatterns.get(pattern)! % 50 === 0) {
			console.warn(`Definition re-typed ${expressionPatterns.get(pattern)} times, called from:`, callers);
		}
	}
	
	// Report every 1000 expressions typed
	if (expressionTypeCount % 1000 === 0) {
		console.warn(`Expression typing: ${expressionTypeCount} total`);
		const topKinds = Array.from(expressionKindCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		console.warn('Top expression kinds:', topKinds);
		
		const topPatterns = Array.from(expressionPatterns.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		console.warn('Most re-typed expressions:', topPatterns);
	}
	
	switch (expr.kind) {
		case 'literal':
			return typeLiteral(expr, state);

		case 'variable':
			return typeVariableExpr(expr, state);

		case 'function':
			return typeFunction(expr, state);

		case 'application':
			return typeApplication(expr, state);

		case 'pipeline':
			return typePipeline(expr, state);

		case 'binary':
			return typeBinary(expr, state);

		case 'if':
			return typeIf(expr, state);

		case 'definition':
			return typeDefinition(expr, state);

		case 'mutable-definition':
			return typeMutableDefinition(expr, state);

		case 'mutation':
			return typeMutation(expr, state);

		case 'import':
			return typeImport(expr, state);

		case 'record':
			return typeRecord(expr, state);

		case 'accessor':
			return typeAccessor(expr, state);

		case 'list':
			return typeList(expr, state);

		case 'tuple':
			return typeTuple(expr, state);

		case 'where':
			return typeWhere(expr, state);

		case 'unit':
			return createPureTypeResult(unitType(), state);

		case 'typed':
			return typeTyped(expr, state);

		case 'constrained':
			return typeConstrained(expr, state);

		case 'type-definition':
			return typeTypeDefinition(expr, state);

		case 'match':
			return typeMatch(expr, state);

		default:
			throw new Error(
				`Unsupported expression kind: ${(expr as Expression).kind}`
			);
	}
};