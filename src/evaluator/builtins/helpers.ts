import { isFunction, isNativeFunction, type Value } from '../evaluator-utils';

export const applyValueFunction = (func: Value, arg: Value): Value => {
	if (isFunction(func) || isNativeFunction(func)) {
		return func.fn(arg);
	}
	throw new Error(
		`Cannot apply argument to non-function: ${func?.tag || 'unknown'}`
	);
};

export const createHOFError = (
	functionName: string,
	requiredArgs: string[]
): string => `${functionName} requires ${requiredArgs.join(', ')}`;
