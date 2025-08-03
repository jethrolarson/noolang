import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Lexer } from './lexer/lexer';
import { parse } from './parser/parser';
import { Evaluator, type Value, isNativeFunction } from './evaluator/evaluator';
import {
	createTypeState,
	loadStdlib,
	cleanSubstitutions,
} from './typer/type-operations';
import { initializeBuiltins } from './typer/builtins';
import { typeToString } from './typer/helpers';
import type { TypeState } from './typer/types';
import { typeExpression, unionEffects, emptyEffects } from './typer';
import type { Expression, FieldExpression, LiteralExpression } from './ast';
import { formatValue } from './format';
import { colorize } from './colors';
import { typeAndDecorate } from './typer';

const log = console.log.bind(console);

// Interface for REPL output - makes testing easier
export interface REPLOutput {
	log(message: string): void;
	error(message: string): void;
}

// Default console output implementation  
export class ConsoleOutput implements REPLOutput {
	log(message: string): void {
		console.log(message);
	}
	
	error(message: string): void {
		console.error(message);
	}
}

// Testable REPL core without readline dependency
export class REPLCore {
	evaluator: Evaluator;
	typeState: TypeState;
	private output: REPLOutput;

	constructor(
		output: REPLOutput = new ConsoleOutput(),
		options: { skipStdlib?: boolean } = {}
	) {
		this.typeState = createTypeState();
		this.typeState = initializeBuiltins(this.typeState);

		if (!options.skipStdlib) {
			this.typeState = loadStdlib(this.typeState); // Ensure stdlib types are loaded
		}

		this.evaluator = new Evaluator({
			traitRegistry: this.typeState.traitRegistry,
			skipStdlib: options.skipStdlib,
		});
		this.output = output;
	}

	// Main method for processing REPL input - fully testable
	public processInput(input: string): {
		success: boolean;
		output?: string;
		error?: string;
	} {
		if (input === '') {
			return { success: true };
		}

		// Handle REPL commands
		if (input.startsWith('.')) {
			return this.handleCommand(input);
		}

		try {
			// Parse the input
			const lexer = new Lexer(input);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			// Type check the program using functional typer with persistent state
			const { program: decoratedProgram, state } = typeAndDecorate(
				program,
				this.typeState
			);

			// Also type check to get effects using our persistent state
			let currentState = this.typeState;
			let finalType = null;
			let allEffects = emptyEffects();

			for (const statement of program.statements) {
				const result = typeExpression(statement, currentState);
				currentState = result.state;
				finalType = result.type;
				allEffects = unionEffects(allEffects, result.effects);
			}

			// Update the persistent type state for next REPL input
			// Clean substitutions to prevent type pollution between evaluations
			this.typeState = cleanSubstitutions(state);

			// Evaluate the decorated program (with type information)
			const programResult = this.evaluator.evaluateProgram(decoratedProgram);

			// Note: The evaluator's environment should already be updated by evaluateProgram
			// No need to manually copy the environment back

			// Format effects for display
			const formatEffects = (effects: Set<string>): string => {
				if (effects.size === 0) {
					return '';
				}
				const effectsList = Array.from(effects)
					.sort()
					.map(e => `!${e}`)
					.join(' ');
				return ` ${colorize.error(effectsList)}`;
			};

			// Print final result prominently
			this.output.log(
				`${colorize.section('➡')} ${colorize.value(
					formatValue(programResult.finalResult)
				)} \t ${colorize.section(':')} ${
					finalType
						? colorize.type(typeToString(finalType, state.substitution))
						: 'unknown'
				}${formatEffects(allEffects)}`
			);

			// Show execution trace for debugging (LLM-friendly)
			if (programResult.executionTrace.length > 1) {
				this.output.log(`\n${colorize.section('Execution Trace:')}`);
				programResult.executionTrace.forEach((step, i) => {
					this.output.log(
						`  ${colorize.number(`${i + 1}.`)} ${colorize.identifier(
							step.expression
						)} ${colorize.operator('→')} ${colorize.value(
							formatValue(step.result)
						)}`
					);
				});
			}
			return { success: true };
		} catch (error) {
			const errorMessage = (error as Error).message;
			// Check if it's already a formatted type error
			if (
				errorMessage.includes('TypeError:') &&
				errorMessage.includes('Expected:')
			) {
				this.output.error(colorize.error(errorMessage));
			} else {
				this.output.error(colorize.error(`Error: ${errorMessage}`));
			}
			return { success: false, error: errorMessage };
		}
	}

	private valueToString(value: Value): string {
		if (typeof value === 'function') {
			return '<function>';
		} else if (isNativeFunction(value)) {
			return `<native:${value.name}>`;
		} else if (Array.isArray(value)) {
			return `[${value.map(this.valueToString).join(', ')}]`;
		} else {
			return String(value);
		}
	}

	private showHelp(): void {
		this.output.log(colorize.section('Noolang REPL Commands:'));
		this.output.log('');
		this.output.log(colorize.section('Basic Commands:'));
		this.output.log(
			`  ${colorize.command('.help')}     - Show this help message`
		);
		this.output.log(`  ${colorize.command('.quit')}     - Exit the REPL`);
		this.output.log(`  ${colorize.command('.exit')}     - Exit the REPL`);
		this.output.log('');
		this.output.log(colorize.section('Environment Commands:'));
		this.output.log(
			`  ${colorize.command('.env')}      - Show current environment with types`
		);
		this.output.log(
			`  ${colorize.command('.env-json')} - Show environment as JSON`
		);
		this.output.log(`  ${colorize.command('.clear-env')} - Clear environment`);
		this.output.log(
			`  ${colorize.command('.types')}    - Show type environment`
		);
		this.output.log('');
		this.output.log(colorize.section('Debugging Commands:'));
		this.output.log(
			`  ${colorize.command('.tokens (expr)')}     - Show tokens for expression`
		);
		this.output.log(
			`  ${colorize.command('.tokens-file file')}  - Show tokens for file`
		);
		this.output.log(
			`  ${colorize.command('.ast (expr)')}        - Show AST for expression`
		);
		this.output.log(
			`  ${colorize.command('.ast-file file')}     - Show AST for expression`
		);
		this.output.log(
			`  ${colorize.command('.ast-json (expr)')}   - Show AST as JSON`
		);
		this.output.log(
			`  ${colorize.command('.error-detail')}      - Show detailed error info`
		);
		this.output.log(
			`  ${colorize.command('.error-context')}     - Show error context`
		);
		this.output.log('');
		this.output.log(colorize.section('Examples:'));
		this.output.log(`  ${colorize.identifier('add = fn x y => x + y')}`);
		this.output.log(`  ${colorize.identifier('add 2 3')}`);
		this.output.log(`  ${colorize.identifier('[1; 2; 3] |> head')}`);
		this.output.log(`  ${colorize.identifier('if true then 1 else 2')}`);
		this.output.log('');
		this.output.log(colorize.section('Debugging Examples:'));
		this.output.log(
			`  ${colorize.command('.tokens (result1 = (@add math) 2 3)')}`
		);
		this.output.log(`  ${colorize.command('.ast (a = 1; b = 2)')}`);
		this.output.log(
			`  ${colorize.command('.ast-file test_import_record.noo')}`
		);
	}

	private showEnvironment(): void {
		const env = this.evaluator.getEnvironment();
		const typeEnv = this.typeState.environment;

		this.output.log(colorize.section('Current Environment:'));
		for (const [name, value] of env) {
			// Get type information from type environment
			const typeScheme = typeEnv.get(name);
			const typeStr = typeScheme
				? typeToString(typeScheme.type, this.typeState.substitution)
				: 'unknown';

			this.output.log(
				`  ${colorize.identifier(name)}: ${colorize.value(formatValue(value))} ${colorize.section(':')} ${colorize.type(typeStr)}`
			);
		}
	}

	private handleCommand(input: string): {
		success: boolean;
		output?: string;
		error?: string;
	} {
		const [command, ...args] = input.split(' ');

		switch (command) {
			case '.quit':
			case '.exit':
				return { success: true }; // Exit the REPL

			case '.help':
				this.showHelp();
				return { success: true };

			case '.env':
				this.showEnvironment();
				return { success: true };

			case '.env-json':
				this.showEnvironmentAsJSON();
				return { success: true };

			case '.types':
				this.showTypeEnvironment();
				return { success: true };

			case '.tokens':
				this.showTokensFromParens(args.join(' '));
				return { success: true };

			case '.tokens-file':
				this.showTokensFromFile(args[0]);
				return { success: true };

			case '.ast':
				this.showASTFromParens(args.join(' '));
				return { success: true };

			case '.ast-file':
				this.showASTFromFile(args[0]);
				return { success: true };

			case '.ast-json':
				this.showASTAsJSONFromParens(args.join(' '));
				return { success: true };

			case '.error-detail':
				this.showErrorDetail();
				return { success: true };

			case '.error-context':
				this.showErrorContext();
				return { success: true };

			default:
				this.output.error(`Unknown command: ${command}`);
				this.output.log('Use .help to see available commands');
				return { success: false };
		}
	}

	private showEnvironmentAsJSON(): void {
		const env = this.evaluator.getEnvironment();
		const typeEnv = this.typeState.environment;

		const envObj: Record<string, { value: string; type: string }> = {};
		for (const [name, value] of env) {
			// Get type information from type environment
			const typeScheme = typeEnv.get(name);
			const typeStr = typeScheme
				? typeToString(typeScheme.type, this.typeState.substitution)
				: 'unknown';

			envObj[name] = {
				value: this.valueToString(value),
				type: typeStr,
			};
		}

		this.output.log(JSON.stringify(envObj, null, 2));
	}

	private showTokensFromParens(input: string): void {
		if (!input) {
			this.output.log(colorize.warning('Usage: .tokens (expression)'));
			return;
		}

		// Extract content from parentheses
		const match = input.match(/^\((.*)\)$/);
		if (!match) {
			this.output.log(
				colorize.warning(
					'Usage: .tokens (expression) - expression must be wrapped in parentheses'
				)
			);
			return;
		}

		const expression = match[1].trim();

		try {
			const lexer = new Lexer(expression);
			const tokens = lexer.tokenize();

			this.output.log(
				`${colorize.section('Tokens for')} "${colorize.identifier(
					expression
				)}":`
			);
			tokens.forEach((token, i) => {
				this.output.log(
					`  ${colorize.number(`${i}:`)} ${colorize.type(
						token.type
					)} ${colorize.string(`'${token.value}'`)}`
				);
			});
		} catch (error) {
			this.output.error(
				colorize.error(`Error tokenizing: ${(error as Error).message}`)
			);
		}
	}

	private showTokensFromFile(filename: string): void {
		if (!filename) {
			this.output.log(colorize.warning('Usage: .tokens-file filename.noo'));
			return;
		}

		try {
			const fullPath = path.resolve(filename);
			const code = fs.readFileSync(fullPath, 'utf8');

			this.output.log(
				`${colorize.section('Tokens for file')} "${colorize.identifier(
					filename
				)}":`
			);
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();

			tokens.forEach((token, i) => {
				this.output.log(
					`  ${colorize.number(`${i}:`)} ${colorize.type(
						token.type
					)} ${colorize.string(`'${token.value}'`)}`
				);
			});
		} catch (error) {
			this.output.error(
				colorize.error(`Error reading file: ${(error as Error).message}`)
			);
		}
	}

	private showASTFromParens(input: string): void {
		if (!input) {
			this.output.log(colorize.warning('Usage: .ast (expression)'));
			return;
		}

		// Extract content from parentheses
		const match = input.match(/^\((.*)\)$/);
		if (!match) {
			this.output.log(
				colorize.warning(
					'Usage: .ast (expression) - expression must be wrapped in parentheses'
				)
			);
			return;
		}

		const expression = match[1].trim();

		try {
			const lexer = new Lexer(expression);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			this.output.log(
				`${colorize.section('AST for')} "${colorize.identifier(expression)}":`
			);
			this.output.log(this.astToString(program.statements[0]));
		} catch (error) {
			this.output.error(
				colorize.error(`Error parsing: ${(error as Error).message}`)
			);
		}
	}

	private showASTFromFile(filename: string): void {
		if (!filename) {
			this.output.log(colorize.warning('Usage: .ast-file filename.noo'));
			return;
		}

		try {
			const fullPath = path.resolve(filename);
			const code = fs.readFileSync(fullPath, 'utf8');

			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			this.output.log(
				`${colorize.section('AST for file')} "${colorize.identifier(
					filename
				)}":`
			);
			this.output.log(this.astToString(program.statements[0]));
		} catch (error) {
			this.output.error(
				colorize.error(`Error parsing file: ${(error as Error).message}`)
			);
		}
	}

	private showASTAsJSONFromParens(input: string): void {
		if (!input) {
			this.output.log(colorize.warning('Usage: .ast-json (expression)'));
			return;
		}

		// Extract content from parentheses
		const match = input.match(/^\((.*)\)$/);
		if (!match) {
			this.output.log(
				colorize.warning(
					'Usage: .ast-json (expression) - expression must be wrapped in parentheses'
				)
			);
			return;
		}

		const expression = match[1].trim();

		try {
			const lexer = new Lexer(expression);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			this.output.log(JSON.stringify(program.statements[0], null, 2));
		} catch (error) {
			this.output.error(
				colorize.error(`Error parsing: ${(error as Error).message}`)
			);
		}
	}

	private showASTAsJSON(input: string): void {
		if (!input) {
			this.output.log(colorize.warning('Usage: .ast-json (expression)'));
			return;
		}

		try {
			const lexer = new Lexer(input);
			const tokens = lexer.tokenize();
			const program = parse(tokens);

			this.output.log(JSON.stringify(program.statements[0], null, 2));
		} catch (error) {
			this.output.error(
				colorize.error(`Error parsing: ${(error as Error).message}`)
			);
		}
	}

	private showErrorDetail(): void {
		this.output.log(
			colorize.warning('Error detail not available - no recent error')
		);
	}

	private showErrorContext(): void {
		this.output.log(
			colorize.warning('Error context not available - no recent error')
		);
	}

	private astToString(expr: Expression, indent: number = 0): string {
		const spaces = '  '.repeat(indent);

		switch (expr.kind) {
			case 'literal':
				return `${spaces}${colorize.type('Literal')}: ${colorize.value(
					String((expr as LiteralExpression).value)
				)}`;
			case 'variable':
				return `${spaces}${colorize.type('Variable')}: ${colorize.identifier(
					expr.name
				)}`;
			case 'function':
				return `${spaces}${colorize.type(
					'Function'
				)}:\n${spaces}  ${colorize.section('params')}: [${expr.params
					.map((p: string) => colorize.identifier(p))
					.join(', ')}]\n${spaces}  ${colorize.section(
					'body'
				)}: ${this.astToString(expr.body, indent + 1)}`;
			case 'application':
				return `${spaces}${colorize.type(
					'Application'
				)}:\n${spaces}  ${colorize.section('func')}: ${this.astToString(
					expr.func,
					indent + 1
				)}\n${spaces}  ${colorize.section('args')}: [${expr.args
					.map((arg: Expression) => this.astToString(arg, indent + 1))
					.join(', ')}]`;
			case 'binary':
				return `${spaces}${colorize.type('Binary')}(${colorize.operator(
					expr.operator
				)}):\n${spaces}  ${colorize.section('left')}: ${this.astToString(
					expr.left,
					indent + 1
				)}\n${spaces}  ${colorize.section('right')}: ${this.astToString(
					expr.right,
					indent + 1
				)}`;
			case 'definition':
				return `${spaces}${colorize.type(
					'Definition'
				)}:\n${spaces}  ${colorize.section('name')}: ${colorize.identifier(
					expr.name
				)}\n${spaces}  ${colorize.section('value')}: ${this.astToString(
					expr.value,
					indent + 1
				)}`;
			case 'import':
				return `${spaces}${colorize.type('Import')}: ${colorize.string(
					`"${expr.path}"`
				)}`;
			case 'record':
				return `${spaces}${colorize.type('Record')}:\n${expr.fields
					.map(
						(field: FieldExpression) =>
							`${spaces}  ${colorize.identifier(
								field.name
							)}: ${this.astToString(field.value, indent + 1)}`
					)
					.join('\n')}`;
			case 'accessor':
				return `${spaces}${colorize.type('Accessor')}: ${colorize.operator(
					'@'
				)}${colorize.identifier(expr.field)}`;
			default:
				return `${spaces}${colorize.type(expr.kind)}: ${colorize.value(
					JSON.stringify(expr)
				)}`;
		}
	}

	private showTypeEnvironment(): void {
		this.output.log(colorize.section('Type Environment:'));
		for (const [name, typeScheme] of this.typeState.environment) {
			const typeStr = typeScheme.type
				? typeToString(typeScheme.type, this.typeState.substitution)
				: 'unknown';
			this.output.log(
				`  ${colorize.identifier(name)}: ${colorize.type(typeStr)}`
			);
		}
	}
}

// Full REPL with readline interface - wraps REPLCore
export class REPL {
	private core: REPLCore;
	private rl: readline.Interface;

	constructor() {
		this.core = new REPLCore();
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: 'noolang> ',
		});
	}

	start(): void {
		log(colorize.success('Welcome to Noolang!'));
		log('Type expressions or definitions. Use Ctrl+C to exit.');
		log('');

		this.rl.prompt();

		this.rl.on('line', (input: string) => {
			try {
				this.core.processInput(input.trim());

				// Handle exit commands
				if (input.trim() === '.quit' || input.trim() === '.exit') {
					this.rl.close();
					return;
				}
			} catch (error) {
				console.error(colorize.error(`Error: ${(error as Error).message}`));
			}
			this.rl.prompt();
		});

		this.rl.on('close', () => {
			log(colorize.info('\nGoodbye!'));
			process.exit(0);
		});
	}

	// Expose core for testing
	public getCore(): REPLCore {
		return this.core;
	}
}

// Start the REPL if this file is run directly
if (typeof require !== 'undefined' && require.main === module) {
	const repl = new REPL();
	repl.start();
}
