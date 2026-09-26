import type { Expression } from '../ast';

export const containsVariable = (
	expr: Expression,
	varName: string
): boolean => {
	switch (expr.kind) {
		case 'variable':
			return expr.name === varName;
		case 'function':
			return containsVariable(expr.body, varName);
		case 'application':
			return (
				containsVariable(expr.func, varName) ||
				expr.args.some(arg => containsVariable(arg, varName))
			);
		case 'binary':
			return (
				containsVariable(expr.left, varName) ||
				containsVariable(expr.right, varName)
			);
		case 'if':
			return (
				containsVariable(expr.condition, varName) ||
				containsVariable(expr.then, varName) ||
				containsVariable(expr.else, varName)
			);
		case 'definition':
		case 'mutable-definition':
			return containsVariable(expr.value, varName);
		case 'mutation':
			return expr.target === varName || containsVariable(expr.value, varName);
		case 'record':
			return expr.fields.some(field => containsVariable(field.value, varName));
		case 'tuple':
		case 'list':
			return expr.elements.some(element => containsVariable(element, varName));
		case 'pipeline':
			return expr.steps.some(step => containsVariable(step, varName));
		case 'match':
			return (
				containsVariable(expr.expression, varName) ||
				expr.cases.some(matchCase =>
					containsVariable(matchCase.expression, varName)
				)
			);
		case 'where':
			return (
				expr.definitions.some(def => containsVariable(def, varName)) ||
				containsVariable(expr.main, varName)
			);
		case 'typed':
		case 'constrained':
			return containsVariable(expr.expression, varName);
		case 'import':
		case 'accessor':
		case 'literal':
		case 'unit':
			return false;
		default:
			return false;
	}
};
