import type { Expression, Type } from '../ast';
import { createError, type NoolangError, type ErrorLocation } from '../errors';
import { formatEffectsString } from './helpers';

export interface TypeErrorContext {
	expression?: Expression;
	expectedType?: Type;
	actualType?: Type;
	functionName?: string;
	parameterIndex?: number;
	operator?: string;
	variableName?: string;
	suggestion?: string;
	codeSnippet?: string;
}

export function createTypeError(
	message: string,
	context?: TypeErrorContext,
	location?: ErrorLocation
): NoolangError {
	let enhancedMessage = message;
	let suggestion = context?.suggestion;

	// Enhance message based on context
	if (context?.expectedType && context?.actualType) {
		enhancedMessage += `\n  Expected: ${typeToString(context.expectedType)}`;
		enhancedMessage += `\n  Got:      ${typeToString(context.actualType)}`;
	}

	// Add function-specific context
	if (context?.functionName) {
		enhancedMessage += `\n  Function: ${context.functionName}`;
	}

	// Add parameter-specific context
	if (context?.parameterIndex !== undefined) {
		enhancedMessage += `\n  Parameter ${context.parameterIndex + 1}`;
	}

	// Add operator context
	if (context?.operator) {
		enhancedMessage += `\n  Operator: ${context.operator}`;
	}

	// Add variable context
	if (context?.variableName) {
		enhancedMessage += `\n  Variable: ${context.variableName}`;
	}

	// Generate suggestions if not provided
	if (!suggestion) {
		suggestion = generateSuggestion(context);
	}

	return createError(
		'TypeError',
		enhancedMessage,
		location,
		context?.codeSnippet,
		suggestion
	);
}

function generateSuggestion(context?: TypeErrorContext): string {
	if (!context) return '';

	// Function application errors
	if (context.functionName && context.expectedType && context.actualType) {
		if (context.parameterIndex !== undefined) {
			return `Check that argument ${context.parameterIndex + 1} matches the expected type. Consider adding a type annotation or using a different value.`;
		}
		return `Check that all arguments match the function's expected parameter types.`;
	}

	// Variable errors
	if (context.variableName) {
		return `Make sure '${context.variableName}' is defined before use. Check for typos or missing definitions.`;
	}

	// Operator errors
	if (context.operator) {
		return `The ${context.operator} operator expects specific types. Check that both operands are compatible.`;
	}

	// General type mismatch
	if (context.expectedType && context.actualType) {
		return `Consider adding a type annotation or using a value of the expected type.`;
	}

	return 'Review the expression and ensure all types are compatible.';
}

// Enhanced error messages for common type errors
export function functionApplicationError(
	funcType: Type,
	argType: Type,
	parameterIndex: number,
	functionName?: string,
	location?: ErrorLocation
): NoolangError {
	const message = `Type mismatch in function application`;
	return createTypeError(
		message,
		{
			expectedType: funcType,
			actualType: argType,
			functionName,
			parameterIndex,
			suggestion: `Argument ${parameterIndex + 1} has type ${typeToString(argType)} but the function expects ${typeToString(funcType)}. Consider using a different value or adding a type conversion.`,
		},
		location
	);
}

export function undefinedVariableError(
	variableName: string,
	location?: ErrorLocation
): NoolangError {
	const message = `Undefined variable`;
	return createTypeError(
		message,
		{
			variableName,
			suggestion: `Define '${variableName}' before using it: ${variableName} = value`,
		},
		location
	);
}

export function nonFunctionApplicationError(
	type: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `Cannot apply non-function type`;
	return createTypeError(
		message,
		{
			actualType: type,
			suggestion: `Only functions can be applied to arguments. Make sure you're calling a function, not a value.`,
		},
		location
	);
}

export function operatorTypeError(
	operator: string,
	expectedType: Type,
	actualType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `Operator type mismatch`;
	return createTypeError(
		message,
		{
			operator,
			expectedType,
			actualType,
			suggestion: `The ${operator} operator expects ${typeToString(expectedType)} but got ${typeToString(actualType)}. Check your operand types.`,
		},
		location
	);
}

export function conditionTypeError(
	actualType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `Condition must be boolean`;
	return createTypeError(
		message,
		{
			actualType,
			suggestion: `Use a boolean expression (True/False) or a comparison that returns a boolean.`,
		},
		location
	);
}

export function ifBranchTypeError(
	thenType: Type,
	elseType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `If branches must have the same type`;
	return createTypeError(
		message,
		{
			expectedType: thenType,
			actualType: elseType,
			suggestion: `Both branches of an if expression must return the same type. Consider adding type annotations or using compatible expressions.`,
		},
		location
	);
}

export function typeAnnotationError(
	expectedType: Type,
	inferredType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `Type annotation mismatch`;
	return createTypeError(
		message,
		{
			expectedType,
			actualType: inferredType,
			suggestion: `The explicit type annotation doesn't match the inferred type. Either adjust the annotation or modify the expression.`,
		},
		location
	);
}

export function listElementTypeError(
	expectedType: Type,
	actualType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `List elements must have the same type`;
	return createTypeError(
		message,
		{
			expectedType,
			actualType,
			suggestion: `All elements in a list must have the same type. Consider using a tuple for mixed types or ensuring all elements are compatible.`,
		},
		location
	);
}

export function pipelineCompositionError(
	outputType: Type,
	inputType: Type,
	location?: ErrorLocation
): NoolangError {
	const message = `Pipeline composition type mismatch`;
	return createTypeError(
		message,
		{
			expectedType: inputType,
			actualType: outputType,
			suggestion: `The output type of the first function must match the input type of the second function in a pipeline.`,
		},
		location
	);
}

export function mutationTypeError(
	targetType: Type,
	valueType: Type,
	variableName: string,
	location?: ErrorLocation
): NoolangError {
	const message = `Type mismatch in mutation`;
	return createTypeError(
		message,
		{
			expectedType: targetType,
			actualType: valueType,
			variableName,
			suggestion: `The new value must have the same type as the mutable variable '${variableName}'.`,
		},
		location
	);
}

export function unificationError(
	type1: Type,
	type2: Type,
	context: {
		reason?: string;
		operation?: string;
		expression?: Expression;
		hint?: string;
	},
	location?: ErrorLocation
): NoolangError {
	let message = `Cannot unify types`;
	let suggestion = `Review the expression and ensure all types are compatible.`;

	// Add specific context based on the reason
	if (context.reason) {
		switch (context.reason) {
			case 'constructor_application':
				message = `Constructor type mismatch`;
				suggestion = `This constructor expects different argument types. Check the ADT definition.`;
				break;
			case 'function_application':
				message = `Function application type mismatch`;
				suggestion = `The function parameters don't match the provided arguments.`;
				break;
			case 'operator_application':
				message = `Operator type mismatch`;
				suggestion = `The operator expects specific types. Check that both operands are compatible.`;
				break;
			case 'if_branches':
				message = `If branch type mismatch`;
				suggestion = `Both branches of an if expression must return the same type.`;
				break;
			case 'pattern_matching':
				message = `Pattern matching type mismatch`;
				suggestion = `The pattern doesn't match the expected type. Check the pattern structure.`;
				break;
			case 'concrete_vs_variable':
				message = `Concrete type vs type variable conflict`;
				suggestion = `Trying to unify a concrete type with a type variable that's already constrained. This often happens with ADT constructors - check if you're using concrete types where type variables are expected.`;
				break;
		}
	}

	if (context.operation) {
		message += ` in ${context.operation}`;
	}

	if (context.hint) {
		suggestion = context.hint;
	}

	return createTypeError(
		message,
		{
			expectedType: type1,
			actualType: type2,
			suggestion,
		},
		location
	);
}

// Helper function to convert types to strings (simplified version)
function typeToString(type: Type): string {
	switch (type.kind) {
		case 'primitive':
			return type.name;
		case 'variable':
			return type.name;
		case 'function':
			const paramStr = type.params.map(typeToString).join(' ');
			const effectStr = formatEffectsString(type.effects);
			return `(${paramStr}) -> ${typeToString(type.return)}${effectStr}`;
		case 'list':
			return `List ${typeToString(type.element)}`;
		case 'tuple':
			return `(${type.elements.map(typeToString).join(' ')})`;
		case 'record':
			return `{ ${Object.entries(type.fields)
				.map(([name, fieldType]) => `${name}: ${typeToString(fieldType)}`)
				.join(' ')} }`;
		case 'variant':
			if (type.args.length === 0) {
				return type.name;
			} else {
				return `${type.name} ${type.args.map(typeToString).join(' ')}`;
			}
		case 'unit':
			return 'unit';
		case 'unknown':
			return '?';
		default:
			return 'unknown';
	}
}

// Enhanced error formatting for better readability
export function formatTypeError(error: NoolangError): string {
	let result = `\n${error.type}: ${error.message}`;

	if (error.location) {
		result += `\n  at line ${error.location.line}, column ${error.location.column}`;
	}

	if (error.context) {
		result += `\n\nCode:\n  ${error.context}`;
	}

	if (error.suggestion) {
		result += `\n\n💡 ${error.suggestion}`;
	}

	return result;
}
