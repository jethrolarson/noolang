// Type expression dispatcher with proper error handling
import { 
	type Expression, 
	type Type,
	type Effect,
	unitType
} from '../ast';
import { TypeState, TypeResult, createPureTypeResult } from './types';
import {
	typeLiteral,
	typeVariableExpr,
	typeFunction,
	typeBinary,
	typeIf,
	typeList,
	typeRecord,
	typeTuple,
	typeAccessor,
	typeDefinition,
	typeConstraintDefinition,
	typeImplementDefinition,
} from './type-inference';
import { typeApplication, typePipeline } from './function-application';
import { typeMatch, typeTypeDefinition } from './pattern-matching';

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

		case 'binary':
			return typeBinary(expr, state);

		case 'if':
			return typeIf(expr, state);

		case 'list':
			return typeList(expr, state);

		case 'record':
			return typeRecord(expr, state);

		case 'tuple':
			return typeTuple(expr, state);

		case 'accessor':
			return typeAccessor(expr, state);

		case 'definition':
			return typeDefinition(expr, state);

		case 'unit':
			return createPureTypeResult(unitType(), state);

		case 'type-definition':
			return typeTypeDefinition(expr, state);

		case 'constraint-definition':
			return typeConstraintDefinition(expr, state);

		case 'implement-definition':
			return typeImplementDefinition(expr, state);

		case 'match':
			return typeMatch(expr, state);

		case 'pipeline':
			return typePipeline(expr, state);

		default:
			throw new Error(`Unknown expression kind: ${(expr as any).kind}`);
	}
};