import { execFileSync } from 'node:child_process';
import {
	type Environment,
	type Value,
	createConstructor,
	createNativeFunction,
	createNumber,
	createRecord,
	createString,
	createUnit,
	isCell,
	isList,
	isNumber,
	isString,
	readErrorValue,
	valueToString,
	writeErrorValue,
} from '../evaluator-utils';
import type { BuiltinDependencies } from './types';

export const registerPrintBuiltin = (environment: Environment): void => {
	// Effectful functions
	environment.set(
		'print',
		createNativeFunction('print', (message: Value) => {
			if (isString(message)) {
				console.log(message.value);
			} else {
				console.log(message);
			}
			return createUnit();
		})
	);
};

export const registerEffectBuiltins = (
	environment: Environment,
	dependencies: BuiltinDependencies
): void => {
	// Missing builtin implementations
	environment.set(
		'println',
		createNativeFunction('println', (value: Value) => {
			console.log(isString(value) ? value.value : valueToString(value));
			return createUnit();
		})
	);

	environment.set(
		'exit',
		createNativeFunction('exit', (code: Value) => {
			if (!isNumber(code)) {
				throw new Error('exit requires a number');
			}
			process.exit(code.value);
		})
	);

	environment.set(
		'readFile',
		createNativeFunction('readFile', (path: Value) => {
			if (!isString(path)) {
				throw new Error('readFile requires a string path');
			}
			try {
				const content = dependencies.fs.readFileSync(path.value, 'utf-8');
				return createConstructor('Ok', [createString(content)]);
			} catch (error) {
				return createConstructor('Err', [readErrorValue(error, path.value)]);
			}
		})
	);

	environment.set(
		'writeFile',
		createNativeFunction('writeFile', (path: Value) => (content: Value) => {
			if (!isString(path)) {
				throw new Error('writeFile requires a string path');
			}
			if (!isString(content)) {
				throw new Error('writeFile requires string content');
			}
			try {
				dependencies.fs.writeFileSync(path.value, content.value);
				return createConstructor('Ok', [createUnit()]);
			} catch (error) {
				return createConstructor('Err', [writeErrorValue(error, path.value)]);
			}
		})
	);

	environment.set(
		'log',
		createNativeFunction('log', (message: Value) => {
			if (!isString(message)) {
				throw new Error('log requires a string message');
			}
			console.log(`[LOG] ${message.value}`);
			return createUnit();
		})
	);

	environment.set(
		'random',
		createNativeFunction('random', () => {
			return createNumber(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
		})
	);

	environment.set(
		'randomRange',
		createNativeFunction('randomRange', (min: Value) => (max: Value) => {
			if (!isNumber(min) || !isNumber(max)) {
				throw new Error('randomRange requires number arguments');
			}
			const minVal = Math.min(min.value, max.value);
			const maxVal = Math.max(min.value, max.value);
			return createNumber(
				Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal
			);
		})
	);

	environment.set(
		'mutSet',
		createNativeFunction('mutSet', (ref: Value) => (value: Value) => {
			if (!isCell(ref)) {
				throw new Error('mutSet requires a mutable reference');
			}
			ref.value = value;
			return createUnit();
		})
	);

	environment.set(
		'mutGet',
		createNativeFunction('mutGet', (ref: Value) => {
			if (!isCell(ref)) {
				throw new Error('mutGet requires a mutable reference');
			}
			return ref.value;
		})
	);

	// Process execution - exec(command, args) -> Result String ExecError
	environment.set(
		'exec',
		createNativeFunction('exec', (command: Value) => (args: Value) => {
			if (!isString(command)) {
				throw new Error('exec requires a string command');
			}
			if (!isList(args)) {
				throw new Error('exec requires a list of string arguments');
			}

			// Validate all arguments are strings
			const argStrings: string[] = [];
			for (const arg of args.values) {
				if (!isString(arg)) {
					throw new Error('exec arguments must all be strings');
				}
				argStrings.push(arg.value);
			}

			try {
				const output = execFileSync(command.value, argStrings, {
					encoding: 'utf8',
					stdio: 'pipe',
				});
				return createConstructor('Ok', [createString(output.toString())]);
			} catch (error: any) {
				// A numeric status means the process ran and exited nonzero;
				// anything else (spawn failure, signal kill) is ExecFailed
				if (typeof error?.status === 'number') {
					return createConstructor('Err', [
						createConstructor('CommandFailed', [
							createRecord({
								code: createNumber(error.status),
								stdout: createString(String(error.stdout ?? '')),
								stderr: createString(String(error.stderr ?? '')),
							}),
						]),
					]);
				}
				const errorMsg = error?.message || 'Process execution failed';
				return createConstructor('Err', [
					createConstructor('ExecFailed', [createString(errorMsg)]),
				]);
			}
		})
	);
};
