import { checkLiterateAssertions } from '../literate-assert';
import type { ExecutionStep } from '../evaluator/evaluator';
import { floatType, stringType } from '../ast';
import { test, expect } from 'bun:test';

const three: ExecutionStep['result'] = { tag: 'number', value: 3 };

const typedStep = (line: number): ExecutionStep => ({
	expression: '1 + 2',
	result: three,
	type: floatType(),
	location: { line, column: 1 },
});

const untypedStep = (line: number): ExecutionStep => ({
	expression: '1 + 2',
	result: three,
	location: { line, column: 1 },
});

test('checkLiterateAssertions - matching value+type does not throw', () => {
	const source = ['1 + 2; # => 3 : Float'].join('\n');
	expect(() => checkLiterateAssertions(source, [typedStep(1)])).not.toThrow();
});

test('checkLiterateAssertions - mismatched value throws with line/expected/actual', () => {
	const source = ['1 + 2; # => 4 : Float'].join('\n');
	expect(() => checkLiterateAssertions(source, [typedStep(1)])).toThrow(
		/line 1.*expected `4 : Float`.*got `3 : Float`/s
	);
});

test('checkLiterateAssertions - line with no # => suffix is skipped', () => {
	const source = ['1 + 2; # just a comment'].join('\n');
	expect(() => checkLiterateAssertions(source, [typedStep(1)])).not.toThrow();
});

test('checkLiterateAssertions - value-only annotation matches when type is undefined', () => {
	const source = ['1 + 2; # => 3'].join('\n');
	expect(() => checkLiterateAssertions(source, [untypedStep(1)])).not.toThrow();
});

test('checkLiterateAssertions - value-only annotation matches even when the step has a real type', () => {
	const source = ['1 + 2; # => 3'].join('\n');
	expect(() => checkLiterateAssertions(source, [typedStep(1)])).not.toThrow();
});

test('checkLiterateAssertions - value-only annotation with wrong value still throws', () => {
	const source = ['1 + 2; # => 4'].join('\n');
	expect(() => checkLiterateAssertions(source, [typedStep(1)])).toThrow(
		/line 1.*expected `4`.*got `3 : Float`/s
	);
});

test('checkLiterateAssertions - a literal "# =>" inside a checked string value does not confuse the parser', () => {
	const value = { tag: 'string', value: 'a # => b' } as const;
	const step: ExecutionStep = {
		expression: 's',
		result: value,
		type: stringType(),
		location: { line: 1, column: 1 },
	};
	const source = ['s = "a # => b";  # => "a # => b" : String'].join('\n');
	expect(() => checkLiterateAssertions(source, [step])).not.toThrow();
});
