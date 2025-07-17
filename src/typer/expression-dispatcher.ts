import {
	type Expression,
	unitType,
} from '../ast';
import { type TypeState, type TypeResult } from './types';
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

// Main type inference dispatcher
export const typeExpression = (
	expr: Expression,
	state: TypeState
): TypeResult => {
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
			return { type: unitType(), state };

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