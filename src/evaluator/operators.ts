import type { BinaryExpression, Expression, PipelineExpression } from '../ast';
import type { TraitRegistry } from '../typer/trait-system';
import {
	boolValue,
	createBool,
	createConstructor,
	createFunction,
	createNumber,
	createString,
	isAnyFunction,
	isCell,
	isConstructor,
	isFunction,
	isNativeFunction,
	isNumber,
	isString,
	isTraitFunctionValue,
	valueToString,
	type Cell,
	type TraitFunctionValue,
	type Value,
} from './evaluator-utils';

export type OperatorContext = {
	traitRegistry: TraitRegistry;
	evaluateExpression: (expression: Expression) => Value;
	isTraitFunction: (functionName: string) => boolean;
	resolveTraitFunctionWithArgs: (
		functionName: string,
		argValues: Value[],
		traitRegistry: TraitRegistry
	) => Value;
	evaluateEquality: (
		left: Value,
		right: Value,
		traitRegistry: TraitRegistry
	) => Value;
	applyTraitFunctionWithValues: (
		traitFunction: TraitFunctionValue,
		argValues: Value[]
	) => Value;
	lookupOperator: (operator: string) => Value | Cell | undefined;
};

export const evaluatePipeline = (
	expr: PipelineExpression,
	context: OperatorContext
): Value => {
	if (expr.steps.length === 1) {
		return context.evaluateExpression(expr.steps[0]);
	}

	const isLeftToRight = expr.operators.every(operator => operator === '|>');
	const isRightToLeft = expr.operators.every(operator => operator === '<|');
	if (!isLeftToRight && !isRightToLeft) {
		throw new Error(
			'Cannot mix pipeline operators |> and <| in the same expression'
		);
	}

	const steps = isRightToLeft ? [...expr.steps].reverse() : expr.steps;
	let composed = context.evaluateExpression(steps[0]);

	for (let i = 1; i < steps.length; i++) {
		const nextFunc = context.evaluateExpression(steps[i]);
		if (isAnyFunction(composed) && isAnyFunction(nextFunc)) {
			const currentComposed = composed;
			composed = createFunction((x: Value) => {
				let intermediate: Value;
				if (isFunction(currentComposed) || isNativeFunction(currentComposed)) {
					intermediate = currentComposed.fn(x);
				} else if (isTraitFunctionValue(currentComposed)) {
					intermediate = context.applyTraitFunctionWithValues(currentComposed, [
						x,
					]);
				} else {
					throw new Error(
						`Invalid function type in pipeline: ${(currentComposed as Value).tag}`
					);
				}

				if (isFunction(nextFunc) || isNativeFunction(nextFunc)) {
					return nextFunc.fn(intermediate);
				} else if (isTraitFunctionValue(nextFunc)) {
					return context.applyTraitFunctionWithValues(nextFunc, [intermediate]);
				} else {
					throw new Error(
						`Invalid function type in pipeline: ${(nextFunc as Value).tag}`
					);
				}
			});
		} else {
			throw new Error(
				`Cannot compose non-functions in pipeline: ${valueToString(composed)} and ${valueToString(nextFunc)}`
			);
		}
	}

	return composed;
};

export const evaluateBinary = (
	expr: BinaryExpression,
	context: OperatorContext
): Value => {
	if (expr.operator === ';') {
		context.evaluateExpression(expr.left);
		return context.evaluateExpression(expr.right);
	} else if (expr.operator === '&&') {
		const left = context.evaluateExpression(expr.left);
		if (!boolValue(left)) return left;
		return context.evaluateExpression(expr.right);
	} else if (expr.operator === '||') {
		const left = context.evaluateExpression(expr.left);
		if (boolValue(left)) return left;
		return context.evaluateExpression(expr.right);
	} else if (expr.operator === '|') {
		const left = context.evaluateExpression(expr.left);
		const right = context.evaluateExpression(expr.right);
		if (right.tag === 'trait-function') {
			const args = Array.isArray(right.partialArgs)
				? [...right.partialArgs, left]
				: [left];
			return context.resolveTraitFunctionWithArgs(
				right.name,
				args,
				right.traitRegistry || context.traitRegistry
			);
		}
		if (isFunction(right) || isNativeFunction(right)) return right.fn(left);
		throw new Error(
			`Cannot apply non-function in thrush: ${valueToString(right)}`
		);
	} else if (expr.operator === '|?') {
		const left = context.evaluateExpression(expr.left);
		const right = context.evaluateExpression(expr.right);
		if (!isAnyFunction(right)) {
			throw new Error(
				`Cannot apply non-function in safe thrush: ${valueToString(right)}`
			);
		}
		if (!isConstructor(left)) {
			throw new Error(
				`Safe thrush operator (|?) requires an Option or Result, got ${valueToString(left)}`
			);
		}

		const applyRight = (arg: Value): Value =>
			isFunction(right) || isNativeFunction(right)
				? right.fn(arg)
				: (() => {
						throw new Error(
							`Cannot apply non-function in safe thrush: ${valueToString(right)}`
						);
					})();

		if (left.name === 'None' || left.name === 'Err') return left;
		if (left.name === 'Some') {
			const result = applyRight(left.args[0]);
			if (
				isConstructor(result) &&
				(result.name === 'Some' || result.name === 'None')
			) {
				return result;
			}
			return { tag: 'constructor', name: 'Some', args: [result] };
		}
		if (left.name === 'Ok') {
			const result = applyRight(left.args[0]);
			if (
				isConstructor(result) &&
				(result.name === 'Ok' || result.name === 'Err')
			) {
				return result;
			}
			return { tag: 'constructor', name: 'Ok', args: [result] };
		}
		throw new Error(
			`Safe thrush operator (|?) requires an Option or Result, got ${left.name}`
		);
	} else if (expr.operator === '$') {
		const left = context.evaluateExpression(expr.left);
		const right = context.evaluateExpression(expr.right);
		if (isFunction(left) || isNativeFunction(left)) return left.fn(right);
		if (isTraitFunctionValue(left)) {
			return context.applyTraitFunctionWithValues(left, [right]);
		}
		throw new Error(
			`Cannot apply non-function in dollar operator: ${valueToString(left)}`
		);
	} else if (expr.operator === '|>') {
		const left = context.evaluateExpression(expr.left);
		const leftVal = isCell(left) ? left.value : left;
		const right = context.evaluateExpression(expr.right);
		const rightVal = isCell(right) ? right.value : right;
		if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
			throw new Error(
				`Both operands of |> must be functions, got ${leftVal.tag} and ${rightVal.tag}`
			);
		}
		return createFunction((x: Value) => {
			let intermediate: Value;
			if (isFunction(leftVal) || isNativeFunction(leftVal)) {
				intermediate = leftVal.fn(x);
			} else if (isTraitFunctionValue(leftVal)) {
				intermediate = context.applyTraitFunctionWithValues(leftVal, [x]);
			} else {
				throw new Error(
					`Invalid function type in |> composition: ${(leftVal as Value).tag}`
				);
			}
			if (isFunction(rightVal) || isNativeFunction(rightVal)) {
				return rightVal.fn(intermediate);
			} else if (isTraitFunctionValue(rightVal)) {
				return context.applyTraitFunctionWithValues(rightVal, [intermediate]);
			}
			throw new Error(
				`Invalid function type in |> composition: ${(rightVal as Value).tag}`
			);
		});
	} else if (expr.operator === '<|') {
		const left = context.evaluateExpression(expr.left);
		const leftVal = isCell(left) ? left.value : left;
		const right = context.evaluateExpression(expr.right);
		const rightVal = isCell(right) ? right.value : right;
		if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
			throw new Error(
				`Both operands of <| must be functions, got ${leftVal.tag} and ${rightVal.tag}`
			);
		}
		return createFunction((x: Value) => {
			let intermediate: Value;
			if (isFunction(rightVal) || isNativeFunction(rightVal)) {
				intermediate = rightVal.fn(x);
			} else if (isTraitFunctionValue(rightVal)) {
				intermediate = context.applyTraitFunctionWithValues(rightVal, [x]);
			} else {
				throw new Error(
					`Invalid function type in <| composition: ${(rightVal as Value).tag}`
				);
			}
			if (isFunction(leftVal) || isNativeFunction(leftVal)) {
				return leftVal.fn(intermediate);
			} else if (isTraitFunctionValue(leftVal)) {
				return context.applyTraitFunctionWithValues(leftVal, [intermediate]);
			}
			throw new Error(
				`Invalid function type in <| composition: ${(leftVal as Value).tag}`
			);
		});
	}

	const left = context.evaluateExpression(expr.left);
	const right = context.evaluateExpression(expr.right);
	const leftVal = isCell(left) ? left.value : left;
	const rightVal = isCell(right) ? right.value : right;

	if (expr.operator === '+') {
		if (isNumber(leftVal) && isNumber(rightVal)) {
			return createNumber(leftVal.value + rightVal.value);
		}
		if (isString(leftVal) && isString(rightVal)) {
			return createString(leftVal.value + rightVal.value);
		}
		if (context.isTraitFunction('add')) {
			try {
				return context.resolveTraitFunctionWithArgs(
					'add',
					[leftVal, rightVal],
					context.traitRegistry
				);
			} catch (_error) {
				/* Fall through to the operator error. */
			}
		}
		throw new Error(
			`Cannot add ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
		);
	}
	if (expr.operator === '-') {
		if (isNumber(leftVal) && isNumber(rightVal)) {
			return createNumber(leftVal.value - rightVal.value);
		}
		if (context.isTraitFunction('subtract')) {
			try {
				return context.resolveTraitFunctionWithArgs(
					'subtract',
					[leftVal, rightVal],
					context.traitRegistry
				);
			} catch (_error) {
				/* Fall through to the operator error. */
			}
		}
		throw new Error(
			`Cannot subtract ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
		);
	}
	if (expr.operator === '*') {
		if (isNumber(leftVal) && isNumber(rightVal)) {
			return createNumber(leftVal.value * rightVal.value);
		}
		if (context.isTraitFunction('multiply')) {
			try {
				return context.resolveTraitFunctionWithArgs(
					'multiply',
					[leftVal, rightVal],
					context.traitRegistry
				);
			} catch (_error) {
				/* Fall through to the operator error. */
			}
		}
		throw new Error(
			`Cannot multiply ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
		);
	}
	if (expr.operator === '/') {
		if (isNumber(leftVal) && isNumber(rightVal)) {
			if (rightVal.value === 0) return createConstructor('None', []);
			return createConstructor('Some', [
				createNumber(leftVal.value / rightVal.value),
			]);
		}
		if (context.isTraitFunction('divide')) {
			try {
				return context.resolveTraitFunctionWithArgs(
					'divide',
					[leftVal, rightVal],
					context.traitRegistry
				);
			} catch (_error) {
				/* Fall through to the operator error. */
			}
		}
		throw new Error(
			`Cannot divide ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
		);
	}
	if (expr.operator === '%') {
		if (isNumber(leftVal) && isNumber(rightVal)) {
			if (rightVal.value === 0) return createConstructor('None', []);
			return createConstructor('Some', [
				createNumber(leftVal.value % rightVal.value),
			]);
		}
		if (context.isTraitFunction('modulus')) {
			try {
				return context.resolveTraitFunctionWithArgs(
					'modulus',
					[leftVal, rightVal],
					context.traitRegistry
				);
			} catch (_error) {
				/* Fall through to the operator error. */
			}
		}
		throw new Error(
			`Cannot modulus ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
		);
	}
	if (expr.operator === '==' || expr.operator === '!=') {
		const result = context.evaluateEquality(
			leftVal,
			rightVal,
			context.traitRegistry
		);
		return expr.operator === '!=' ? createBool(!boolValue(result)) : result;
	}

	const operator = context.lookupOperator(expr.operator);
	const operatorVal = isCell(operator) ? operator.value : operator;
	if (operatorVal && isNativeFunction(operatorVal)) {
		const fn: unknown = operatorVal.fn(leftVal);
		if (typeof fn === 'function') return fn(rightVal) as Value;
		const functionValue = fn as Value;
		if (isFunction(functionValue) || isNativeFunction(functionValue)) {
			return functionValue.fn(rightVal);
		}
		throw new Error(`Operator ${expr.operator} did not return a function`);
	}
	throw new Error(`Unknown operator: ${expr.operator}`);
};
