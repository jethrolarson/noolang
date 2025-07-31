// Central mapping of operators to trait functions
export interface OperatorMapping {
	operator: string;
	traitName: string;
	functionName: string;
	precedence?: number;
}

export const OPERATOR_MAPPINGS: OperatorMapping[] = [
	{ operator: '+', traitName: 'Add', functionName: 'add' },
	{ operator: '-', traitName: 'Sub', functionName: 'subtract' },
	{ operator: '*', traitName: 'Mul', functionName: 'multiply' },
	{ operator: '/', traitName: 'Div', functionName: 'divide' },
	{ operator: '==', traitName: 'Eq', functionName: 'equals' },
	{ operator: '!=', traitName: 'Eq', functionName: 'not_equals' },
	{ operator: '<', traitName: 'Ord', functionName: 'less_than' },
	{ operator: '<=', traitName: 'Ord', functionName: 'less_equal' },
	{ operator: '>', traitName: 'Ord', functionName: 'greater_than' },
	{ operator: '>=', traitName: 'Ord', functionName: 'greater_equal' },
];

export function getOperatorMapping(operator: string): OperatorMapping | null {
	return OPERATOR_MAPPINGS.find(m => m.operator === operator) || null;
}

export function getRequiredTrait(operator: string): string | null {
	const mapping = getOperatorMapping(operator);
	return mapping ? mapping.traitName : null;
}

export function getTraitFunction(operator: string): string | null {
	const mapping = getOperatorMapping(operator);
	return mapping ? mapping.functionName : null;
}

// Phase 1: Pure addition - no existing code changes
export function shouldUseTraitSystem(_operator: string): boolean {
	// For now, always return false to maintain existing behavior
	// This will be enabled in Phase 2
	return false;
} 