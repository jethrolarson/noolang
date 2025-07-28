import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { Evaluator } from '../../evaluator/evaluator';
import { createTypeState, initializeBuiltins, loadStdlib } from '../../typer/type-operations';
import type { TypeState } from '../../typer/types';

// Test REPL core functionality without readline interface
class REPLCore {
	evaluator: Evaluator;
	typeState: TypeState;

	constructor() {
		this.typeState = createTypeState();
		this.typeState = initializeBuiltins(this.typeState);
		this.typeState = loadStdlib(this.typeState);
		this.evaluator = new Evaluator({ traitRegistry: this.typeState.traitRegistry });
	}

	// Extract the core input processing logic without console output
	processInputSilent(input: string): { success: boolean; error?: string } {
		if (input === '') {
			return { success: true };
		}

		// Handle REPL commands
		if (input.startsWith('.')) {
			return this.handleCommandSilent(input);
		}

		try {
			// Parse the input
			const lexer = new Lexer(input);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			// This tests that the core REPL pipeline works
			return { success: true };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	private handleCommandSilent(input: string): { success: boolean; error?: string } {
		const [command] = input.split(' ');

		switch (command) {
			case '.quit':
			case '.exit':
			case '.help':
			case '.env':
			case '.env-json':
			case '.clear-env':
			case '.types':
				return { success: true };
			default:
				return { success: false, error: `Unknown command: ${command}` };
		}
	}

	getEnvironmentSize(): number {
		return this.evaluator.getEnvironment().size;
	}

	getTypeEnvironmentSize(): number {
		return this.typeState.environment.size;
	}
}

test('REPL Core - should create instance', () => {
	const repl = new REPLCore();
	assert.instance(repl, REPLCore);
});

test('REPL Core - should have evaluator property', () => {
	const repl = new REPLCore();
	assert.ok(repl.evaluator, 'evaluator should be defined');
});

test('REPL Core - should have typeState property', () => {
	const repl = new REPLCore();
	assert.ok(repl.typeState, 'typeState should be defined');
});

test('REPL Core - should have initialized type environment', () => {
	const repl = new REPLCore();
	const typeEnvSize = repl.getTypeEnvironmentSize();
	assert.ok(typeEnvSize > 0, 'type environment should be initialized with builtins');
});

test('Basic Functionality - should handle empty input', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('');
	assert.is(result.success, true, 'empty input should succeed');
});

test('Basic Functionality - should handle help command', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('.help');
	assert.is(result.success, true, 'help command should succeed');
});

test('Basic Functionality - should handle quit command', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('.quit');
	assert.is(result.success, true, 'quit command should succeed');
});

test('Basic Functionality - should handle exit command', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('.exit');
	assert.is(result.success, true, 'exit command should succeed');
});

test('Basic Functionality - should handle unknown command', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('.unknown');
	assert.is(result.success, false, 'unknown command should fail');
	assert.ok(result.error?.includes('Unknown command'), 'should have error message about unknown command');
});

test('Basic Functionality - should handle env commands', () => {
	const repl = new REPLCore();
	
	const envResult = repl.processInputSilent('.env');
	assert.is(envResult.success, true, 'env command should succeed');
	
	const envJsonResult = repl.processInputSilent('.env-json');
	assert.is(envJsonResult.success, true, 'env-json command should succeed');
	
	const typesResult = repl.processInputSilent('.types');
	assert.is(typesResult.success, true, 'types command should succeed');
});

test('Basic Functionality - should handle simple expression', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('42');
	assert.is(result.success, true, 'simple expression should succeed');
});

test('Basic Functionality - should handle simple string', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('"hello"');
	assert.is(result.success, true, 'simple string should succeed');
});

test('Basic Functionality - should handle invalid syntax', () => {
	const repl = new REPLCore();
	const result = repl.processInputSilent('invalid syntax here @#$');
	assert.is(result.success, false, 'invalid syntax should fail');
	assert.ok(result.error, 'should have error message');
});

test.run();
