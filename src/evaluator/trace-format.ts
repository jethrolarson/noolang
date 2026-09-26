import type { Expression } from '../ast';

export const expressionToString = (expr: Expression): string => {
	switch (expr.kind) {
		case 'literal':
			if (Array.isArray(expr.value)) {
				return `[${expr.value
					.map(element => expressionToString(element as Expression))
					.join(' ')}]`;
			}
			return String(expr.value);
		case 'variable':
			return expr.name;
		case 'function':
			return `fn ${expr.params.join(' ')} => ${expressionToString(expr.body)}`;
		case 'application':
			return `${expressionToString(expr.func)} ${expr.args
				.map(expressionToString)
				.join(' ')}`;
		case 'pipeline':
			return expr.steps.map(expressionToString).join(' | ');
		case 'binary':
			return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
		case 'if':
			return `if ${expressionToString(expr.condition)} then ${expressionToString(expr.then)} else ${expressionToString(expr.else)}`;
		case 'definition':
			return `${expr.name} = ${expressionToString(expr.value)}`;
		case 'mutable-definition':
			return `${expr.name} = ${expressionToString(expr.value)}`;
		case 'mutation':
			return `mut ${expr.target} = ${expressionToString(expr.value)}`;
		case 'import':
			return `import "${expr.path}"`;
		case 'record':
			return `{ ${expr.fields
				.map(field => `${field.name} = ${expressionToString(field.value)}`)
				.join(', ')} }`;
		case 'accessor':
			return `@${expr.field}${expr.optional ? '?' : ''}`;
		case 'where':
			return `${expressionToString(expr.main)} where (${expr.definitions
				.map(expressionToString)
				.join('; ')})`;
		case 'constraint-definition':
			return `constraint ${expr.name}`;
		case 'implement-definition':
			return `implement ${expr.constraintName}`;
		default:
			return 'unknown';
	}
};
