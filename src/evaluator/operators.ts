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

const evaluateThrush = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
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
};

const evaluateSafeThrush = (left: Value, right: Value): Value => {
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
};

const evaluateDollar = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isFunction(left) || isNativeFunction(left)) return left.fn(right);
	if (isTraitFunctionValue(left)) {
		return context.applyTraitFunctionWithValues(left, [right]);
	}
	throw new Error(
		`Cannot apply non-function in dollar operator: ${valueToString(left)}`
	);
};

const evaluateForwardComposition = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (!isAnyFunction(left) || !isAnyFunction(right)) {
		throw new Error(
			`Both operands of |> must be functions, got ${left.tag} and ${right.tag}`
		);
	}
	return createFunction((x: Value) => {
		let intermediate: Value;
		if (isFunction(left) || isNativeFunction(left)) {
			intermediate = left.fn(x);
		} else if (isTraitFunctionValue(left)) {
			intermediate = context.applyTraitFunctionWithValues(left, [x]);
		} else {
			throw new Error(
				`Invalid function type in |> composition: ${(left as Value).tag}`
			);
		}
		if (isFunction(right) || isNativeFunction(right)) {
			return right.fn(intermediate);
		} else if (isTraitFunctionValue(right)) {
			return context.applyTraitFunctionWithValues(right, [intermediate]);
		}
		throw new Error(
			`Invalid function type in |> composition: ${(right as Value).tag}`
		);
	});
};

const evaluateBackwardComposition = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (!isAnyFunction(left) || !isAnyFunction(right)) {
		throw new Error(
			`Both operands of <| must be functions, got ${left.tag} and ${right.tag}`
		);
	}
	return createFunction((x: Value) => {
		let intermediate: Value;
		if (isFunction(right) || isNativeFunction(right)) {
			intermediate = right.fn(x);
		} else if (isTraitFunctionValue(right)) {
			intermediate = context.applyTraitFunctionWithValues(right, [x]);
		} else {
			throw new Error(
				`Invalid function type in <| composition: ${(right as Value).tag}`
			);
		}
		if (isFunction(left) || isNativeFunction(left)) {
			return left.fn(intermediate);
		} else if (isTraitFunctionValue(left)) {
			return context.applyTraitFunctionWithValues(left, [intermediate]);
		}
		throw new Error(
			`Invalid function type in <| composition: ${(left as Value).tag}`
		);
	});
};

const evaluateAdd = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isNumber(left) && isNumber(right)) {
		return createNumber(left.value + right.value);
	}
	if (isString(left) && isString(right)) {
		return createString(left.value + right.value);
	}
	if (context.isTraitFunction('add')) {
		try {
			return context.resolveTraitFunctionWithArgs(
				'add',
				[left, right],
				context.traitRegistry
			);
		} catch (_error) {
			/* Fall through to the operator error. */
		}
	}
	throw new Error(
		`Cannot add ${left?.tag || 'unit'} and ${right?.tag || 'unit'}`
	);
};

const evaluateSubtract = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isNumber(left) && isNumber(right)) {
		return createNumber(left.value - right.value);
	}
	if (context.isTraitFunction('subtract')) {
		try {
			return context.resolveTraitFunctionWithArgs(
				'subtract',
				[left, right],
				context.traitRegistry
			);
		} catch (_error) {
			/* Fall through to the operator error. */
		}
	}
	throw new Error(
		`Cannot subtract ${left?.tag || 'unit'} and ${right?.tag || 'unit'}`
	);
};

const evaluateMultiply = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isNumber(left) && isNumber(right)) {
		return createNumber(left.value * right.value);
	}
	if (context.isTraitFunction('multiply')) {
		try {
			return context.resolveTraitFunctionWithArgs(
				'multiply',
				[left, right],
				context.traitRegistry
			);
		} catch (_error) {
			/* Fall through to the operator error. */
		}
	}
	throw new Error(
		`Cannot multiply ${left?.tag || 'unit'} and ${right?.tag || 'unit'}`
	);
};

const evaluateDivide = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isNumber(left) && isNumber(right)) {
		if (right.value === 0) return createConstructor('None', []);
		return createConstructor('Some', [createNumber(left.value / right.value)]);
	}
	if (context.isTraitFunction('divide')) {
		try {
			return context.resolveTraitFunctionWithArgs(
				'divide',
				[left, right],
				context.traitRegistry
			);
		} catch (_error) {
			/* Fall through to the operator error. */
		}
	}
	throw new Error(
		`Cannot divide ${left?.tag || 'unit'} and ${right?.tag || 'unit'}`
	);
};

const evaluateModulus = (
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	if (isNumber(left) && isNumber(right)) {
		if (right.value === 0) return createConstructor('None', []);
		return createConstructor('Some', [createNumber(left.value % right.value)]);
	}
	if (context.isTraitFunction('modulus')) {
		try {
			return context.resolveTraitFunctionWithArgs(
				'modulus',
				[left, right],
				context.traitRegistry
			);
		} catch (_error) {
			/* Fall through to the operator error. */
		}
	}
	throw new Error(
		`Cannot modulus ${left?.tag || 'unit'} and ${right?.tag || 'unit'}`
	);
};

const evaluateArithmetic = (
	operator: '+' | '-' | '*' | '/' | '%',
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	switch (operator) {
		case '+':
			return evaluateAdd(left, right, context);
		case '-':
			return evaluateSubtract(left, right, context);
		case '*':
			return evaluateMultiply(left, right, context);
		case '/':
			return evaluateDivide(left, right, context);
		case '%':
			return evaluateModulus(left, right, context);
	}
};

const evaluateEquality = (
	operator: '==' | '!=',
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	const result = context.evaluateEquality(left, right, context.traitRegistry);
	return operator === '!=' ? createBool(!boolValue(result)) : result;
};

const evaluateFallbackOperator = (
	operator: BinaryExpression['operator'],
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	const operatorValue = context.lookupOperator(operator);
	const unwrappedOperator = isCell(operatorValue)
		? operatorValue.value
		: operatorValue;
	if (unwrappedOperator && isNativeFunction(unwrappedOperator)) {
		const fn: unknown = unwrappedOperator.fn(left);
		if (typeof fn === 'function') return fn(right) as Value;
		const functionValue = fn as Value;
		if (isFunction(functionValue) || isNativeFunction(functionValue)) {
			return functionValue.fn(right);
		}
		throw new Error(`Operator ${operator} did not return a function`);
	}
	throw new Error(`Unknown operator: ${operator}`);
};

const evaluateEagerBinary = (
	operator: BinaryExpression['operator'],
	left: Value,
	right: Value,
	context: OperatorContext
): Value => {
	switch (operator) {
		case '+':
		case '-':
		case '*':
		case '/':
		case '%':
			return evaluateArithmetic(operator, left, right, context);
		case '==':
		case '!=':
			return evaluateEquality(operator, left, right, context);
		default:
			return evaluateFallbackOperator(operator, left, right, context);
	}
};

export const evaluateBinary = (
	expr: BinaryExpression,
	context: OperatorContext
): Value => {
	switch (expr.operator) {
		case ';':
			context.evaluateExpression(expr.left);
			return context.evaluateExpression(expr.right);
		case '&&': {
			const left = context.evaluateExpression(expr.left);
			if (!boolValue(left)) return left;
			return context.evaluateExpression(expr.right);
		}
		case '||': {
			const left = context.evaluateExpression(expr.left);
			if (boolValue(left)) return left;
			return context.evaluateExpression(expr.right);
		}
		case '|': {
			const left = context.evaluateExpression(expr.left);
			const right = context.evaluateExpression(expr.right);
			return evaluateThrush(left, right, context);
		}
		case '|?': {
			const left = context.evaluateExpression(expr.left);
			const right = context.evaluateExpression(expr.right);
			return evaluateSafeThrush(left, right);
		}
		case '$': {
			const left = context.evaluateExpression(expr.left);
			const right = context.evaluateExpression(expr.right);
			return evaluateDollar(left, right, context);
		}
		case '|>': {
			const left = context.evaluateExpression(expr.left);
			const leftValue = isCell(left) ? left.value : left;
			const right = context.evaluateExpression(expr.right);
			const rightValue = isCell(right) ? right.value : right;
			return evaluateForwardComposition(leftValue, rightValue, context);
		}
		case '<|': {
			const left = context.evaluateExpression(expr.left);
			const leftValue = isCell(left) ? left.value : left;
			const right = context.evaluateExpression(expr.right);
			const rightValue = isCell(right) ? right.value : right;
			return evaluateBackwardComposition(leftValue, rightValue, context);
		}
		default: {
			const left = context.evaluateExpression(expr.left);
			const right = context.evaluateExpression(expr.right);
			const leftValue = isCell(left) ? left.value : left;
			const rightValue = isCell(right) ? right.value : right;
			return evaluateEagerBinary(expr.operator, leftValue, rightValue, context);
		}
	}
};
