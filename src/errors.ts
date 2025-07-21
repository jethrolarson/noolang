export type ErrorType =
	| 'ParseError'
	| 'TypeError'
	| 'RuntimeError'
	| 'ImportError'
	| 'LexerError';

export interface ErrorLocation {
	line: number;
	column: number;
	start?: number;
	end?: number;
}

export interface NoolangError {
	type: ErrorType;
	message: string;
	location?: ErrorLocation;
	context?: string;
	suggestion?: string;
}

export const createError = (
	type: ErrorType,
	message: string,
	location?: ErrorLocation,
	context?: string,
	suggestion?: string
): NoolangError => ({
	type,
	message,
	location,
	context,
	suggestion,
});

export function errorToString(error: NoolangError): string {
	let result = `${error.type}: ${error.message}`;

	if (error.location) {
		result += ` at line ${error.location.line}, column ${error.location.column}`;
	}

	if (error.context) {
		result += `\nContext: ${error.context}`;
	}

	if (error.suggestion) {
		result += `\nSuggestion: ${error.suggestion}`;
	}

	return result;
}

export const errorToJSON = (error: NoolangError): string =>
	JSON.stringify(error, null, 2);
