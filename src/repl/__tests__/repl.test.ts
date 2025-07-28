import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

// Helper function to run REPL commands via shell
async function runReplCommand(input: string, timeout = 5000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve) => {
		const replPath = path.join(process.cwd(), 'src', 'repl.ts');
		const child = spawn('npx', ['tsx', replPath], {
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: true
		});

		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (data) => {
			stdout += data.toString();
		});

		child.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		// Send input and then quit
		const commands = input.split('\n').filter(cmd => cmd.trim() !== '');
		commands.push('.quit');
		
		setTimeout(() => {
			const inputText = commands.join('\n') + '\n';
			child.stdin?.write(inputText);
			child.stdin?.end();
		}, 100);

		const timer = setTimeout(() => {
			child.kill('SIGTERM');
			resolve({ stdout, stderr, exitCode: null });
		}, timeout);

		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}

// Helper function to test simple expressions that don't require interactive REPL
async function testSimpleExpression(expression: string): Promise<boolean> {
	try {
		// Test by creating a temporary noo file and running it
		const { spawn } = require('child_process');
		return new Promise((resolve) => {
			const child = spawn('npx', ['tsx', '-e', `
				import { Lexer } from './src/lexer/lexer';
				import { parse } from './src/parser/parser';
				try {
					const lexer = new Lexer('${expression}');
					const tokens = lexer.tokenize();
					const program = parse(tokens);
					console.log('SUCCESS');
				} catch (error) {
					console.log('ERROR:', error.message);
				}
			`], { cwd: process.cwd() });

			let output = '';
			child.stdout?.on('data', (data) => {
				output += data.toString();
			});

			child.on('close', () => {
				resolve(output.includes('SUCCESS'));
			});
		});
	} catch {
		return false;
	}
}

test('REPL Shell - should start and show welcome message', async () => {
	const result = await runReplCommand('');
	assert.ok(result.stdout.includes('Welcome to Noolang'), 'should show welcome message');
});

test('REPL Shell - should handle help command', async () => {
	const result = await runReplCommand('.help');
	assert.ok(result.stdout.includes('REPL Commands'), 'should show help text');
});

test('REPL Shell - should handle quit command', async () => {
	const result = await runReplCommand('.quit');
	assert.is(result.exitCode, 0, 'should exit cleanly with quit command');
});

test('REPL Shell - should handle unknown command', async () => {
	const result = await runReplCommand('.unknown');
	assert.ok(result.stdout.includes('Unknown command'), 'should show unknown command error');
});

test('REPL Core - should parse simple expression', async () => {
	const success = await testSimpleExpression('42');
	assert.is(success, true, 'should parse simple number');
});

test('REPL Core - should parse string expression', async () => {
	const success = await testSimpleExpression('"hello"');
	assert.is(success, true, 'should parse simple string');
});

test('REPL Core - should parse boolean expression', async () => {
	const success = await testSimpleExpression('True');
	assert.is(success, true, 'should parse boolean');
});

test('REPL Core - should reject invalid syntax', async () => {
	const success = await testSimpleExpression('invalid @#$ syntax');
	assert.is(success, false, 'should reject invalid syntax');
});

test.run();
