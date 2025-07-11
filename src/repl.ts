import * as readline from 'readline';
import { Lexer } from './lexer';
import { parse } from './parser/parser';
import { Evaluator, Value, isNativeFunction } from './evaluator';
import { Typer } from './typer';
import { Type } from './ast';

export class REPL {
  private evaluator: Evaluator;
  private typer: Typer;
  private rl: readline.Interface;

  constructor() {
    this.evaluator = new Evaluator();
    this.typer = new Typer();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'noolang> ',
    });
  }

  start(): void {
    console.log('Welcome to Noolang!');
    console.log('Type expressions or definitions. Use Ctrl+C to exit.');
    console.log('');

    this.rl.prompt();

    this.rl.on('line', (input: string) => {
      try {
        this.processInput(input.trim());
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
      }
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      process.exit(0);
    });
  }

  private processInput(input: string): void {
    if (input === '') {
      return;
    }

    // Handle REPL commands
    if (input.startsWith('.')) {
      this.handleCommand(input);
      return;
    }

    try {
      // Parse the input
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      // Type check the program
      const types = this.typer.typeProgram(program);

      // Evaluate the program
      const programResult = this.evaluator.evaluateProgram(program);
      const type = types[types.length - 1]; // Get the type of the final expression

      // Print final result prominently
      console.log(`Result: ${this.valueToString(programResult.finalResult)}`);
      if (type) {
        console.log(`Type: ${this.typeToString(type)}`);
      }

      // Show execution trace for debugging (LLM-friendly)
      if (programResult.executionTrace.length > 1) {
        console.log('\nExecution Trace:');
        programResult.executionTrace.forEach((step, i) => {
          console.log(`  ${i + 1}. ${step.expression} → ${this.valueToString(step.result)}`);
        });
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
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

  private typeToString(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        return type.name;
      case 'function':
        const paramStr = type.params.map(this.typeToString.bind(this)).join(' ');
        return `(${paramStr}) -> ${this.typeToString(type.return)}`;
      case 'variable':
        return type.name;
      case 'unknown':
        return '?';
      default:
        return 'unknown';
    }
  }

  private showHelp(): void {
    console.log('Noolang REPL Commands:');
    console.log('');
    console.log('Basic Commands:');
    console.log('  .help     - Show this help message');
    console.log('  .quit     - Exit the REPL');
    console.log('  .exit     - Exit the REPL');
    console.log('');
    console.log('Environment Commands:');
    console.log('  .env      - Show current environment');
    console.log('  .env-detail - Show detailed environment with types');
    console.log('  .env-json - Show environment as JSON');
    console.log('  .clear-env - Clear environment');
    console.log('  .types    - Show type environment');
    console.log('');
    console.log('Debugging Commands:');
    console.log('  .tokens (expr)     - Show tokens for expression');
    console.log('  .tokens-file file  - Show tokens for file');
    console.log('  .ast (expr)        - Show AST for expression');
    console.log('  .ast-file file     - Show AST for file');
    console.log('  .ast-json (expr)   - Show AST as JSON');
    console.log('  .error-detail      - Show detailed error info');
    console.log('  .error-context     - Show error context');
    console.log('');
    console.log('Examples:');
    console.log('  add = fn x y => x + y');
    console.log('  add 2 3');
    console.log('  [1; 2; 3] |> head');
    console.log('  if true then 1 else 2');
    console.log('');
    console.log('Debugging Examples:');
    console.log('  .tokens (result1 = (@add math) 2 3)');
    console.log('  .ast (a = 1; b = 2)');
    console.log('  .ast-file test_import_record.noo');
  }

  private showEnvironment(): void {
    const env = this.evaluator.getEnvironment();
    console.log('Current Environment:');
    for (const [name, value] of env) {
      console.log(`  ${name}: ${this.valueToString(value)}`);
    }
  }

  private handleCommand(input: string): void {
    const [command, ...args] = input.split(' ');
    
    switch (command) {
      case '.quit':
      case '.exit':
        this.rl.close();
        break;
        
      case '.help':
        this.showHelp();
        break;
        
      case '.env':
        this.showEnvironment();
        break;
        
      case '.env-detail':
        this.showDetailedEnvironment();
        break;
        
      case '.env-json':
        this.showEnvironmentAsJSON();
        break;
        
      case '.clear-env':
        this.clearEnvironment();
        break;
        
      case '.types':
        this.showTypeEnvironment();
        break;
        
      case '.tokens':
        this.showTokensFromParens(args.join(' '));
        break;
        
      case '.tokens-file':
        this.showTokensFromFile(args[0]);
        break;
        
      case '.ast':
        this.showASTFromParens(args.join(' '));
        break;
        
      case '.ast-file':
        this.showASTFromFile(args[0]);
        break;
        
      case '.ast-json':
        this.showASTAsJSONFromParens(args.join(' '));
        break;
        
      case '.error-detail':
        this.showErrorDetail();
        break;
        
      case '.error-context':
        this.showErrorContext();
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Use .help to see available commands');
    }
  }

  private showDetailedEnvironment(): void {
    const env = this.evaluator.getEnvironment();
    const typeEnv = this.typer.getTypeEnvironment();
    
    console.log('Detailed Environment:');
    for (const [name, value] of env) {
      const type = typeEnv.get(name);
      console.log(`  ${name}:`);
      console.log(`    Value: ${this.valueToString(value)}`);
      console.log(`    Type: ${type ? this.typeToString(type) : 'unknown'}`);
    }
  }

  private showEnvironmentAsJSON(): void {
    const env = this.evaluator.getEnvironment();
    const typeEnv = this.typer.getTypeEnvironment();
    
    const envObj: any = {};
    for (const [name, value] of env) {
      const type = typeEnv.get(name);
      envObj[name] = {
        value: this.valueToString(value),
        type: type ? this.typeToString(type) : 'unknown'
      };
    }
    
    console.log(JSON.stringify(envObj, null, 2));
  }

  private clearEnvironment(): void {
    this.evaluator = new Evaluator();
    this.typer = new Typer();
    console.log('Environment cleared');
  }

  private showTokensFromParens(input: string): void {
    if (!input) {
      console.log('Usage: .tokens (expression)');
      return;
    }
    
    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log('Usage: .tokens (expression) - expression must be wrapped in parentheses');
      return;
    }
    
    const expression = match[1].trim();
    
    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      
      console.log(`Tokens for "${expression}":`);
      tokens.forEach((token, i) => {
        console.log(`  ${i}: ${token.type} '${token.value}'`);
      });
    } catch (error) {
      console.error(`Error tokenizing: ${(error as Error).message}`);
    }
  }

  private showTokens(input: string): void {
    if (!input) {
      console.log('Usage: .tokens (expression)');
      return;
    }
    
    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      
      console.log(`Tokens for "${input}":`);
      tokens.forEach((token, i) => {
        console.log(`  ${i}: ${token.type} '${token.value}'`);
      });
    } catch (error) {
      console.error(`Error tokenizing: ${(error as Error).message}`);
    }
  }

  private showTokensFromFile(filename: string): void {
    if (!filename) {
      console.log('Usage: :tokens-file filename.noo');
      return;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.resolve(filename);
      const code = fs.readFileSync(fullPath, 'utf8');
      
      console.log(`Tokens for file "${filename}":`);
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      
      tokens.forEach((token, i) => {
        console.log(`  ${i}: ${token.type} '${token.value}'`);
      });
    } catch (error) {
      console.error(`Error reading file: ${(error as Error).message}`);
    }
  }

  private showASTFromParens(input: string): void {
    if (!input) {
      console.log('Usage: .ast (expression)');
      return;
    }
    
    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log('Usage: .ast (expression) - expression must be wrapped in parentheses');
      return;
    }
    
    const expression = match[1].trim();
    
    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      console.log(`AST for "${expression}":`);
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(`Error parsing: ${(error as Error).message}`);
    }
  }

  private showAST(input: string): void {
    if (!input) {
      console.log('Usage: .ast (expression)');
      return;
    }
    
    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      console.log(`AST for "${input}":`);
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(`Error parsing: ${(error as Error).message}`);
    }
  }

  private showASTFromFile(filename: string): void {
    if (!filename) {
      console.log('Usage: :ast-file filename.noo');
      return;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.resolve(filename);
      const code = fs.readFileSync(fullPath, 'utf8');
      
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      console.log(`AST for file "${filename}":`);
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(`Error parsing file: ${(error as Error).message}`);
    }
  }

  private showASTAsJSONFromParens(input: string): void {
    if (!input) {
      console.log('Usage: .ast-json (expression)');
      return;
    }
    
    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log('Usage: .ast-json (expression) - expression must be wrapped in parentheses');
      return;
    }
    
    const expression = match[1].trim();
    
    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      console.log(JSON.stringify(program.statements[0], null, 2));
    } catch (error) {
      console.error(`Error parsing: ${(error as Error).message}`);
    }
  }

  private showASTAsJSON(input: string): void {
    if (!input) {
      console.log('Usage: .ast-json (expression)');
      return;
    }
    
    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      console.log(JSON.stringify(program.statements[0], null, 2));
    } catch (error) {
      console.error(`Error parsing: ${(error as Error).message}`);
    }
  }

  private showErrorDetail(): void {
    console.log('Error detail not available - no recent error');
  }

  private showErrorContext(): void {
    console.log('Error context not available - no recent error');
  }

  private astToString(expr: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    
    switch (expr.kind) {
      case 'literal':
        return `${spaces}Literal: ${expr.value}`;
      case 'variable':
        return `${spaces}Variable: ${expr.name}`;
      case 'function':
        return `${spaces}Function:\n${spaces}  params: [${expr.params.join(', ')}]\n${spaces}  body: ${this.astToString(expr.body, indent + 1)}`;
      case 'application':
        return `${spaces}Application:\n${spaces}  func: ${this.astToString(expr.func, indent + 1)}\n${spaces}  args: [${expr.args.map((arg: any) => this.astToString(arg, indent + 1)).join(', ')}]`;
      case 'binary':
        return `${spaces}Binary(${expr.operator}):\n${spaces}  left: ${this.astToString(expr.left, indent + 1)}\n${spaces}  right: ${this.astToString(expr.right, indent + 1)}`;
      case 'definition':
        return `${spaces}Definition:\n${spaces}  name: ${expr.name}\n${spaces}  value: ${this.astToString(expr.value, indent + 1)}`;
      case 'import':
        return `${spaces}Import: "${expr.path}"`;
      case 'record':
        return `${spaces}Record:\n${expr.fields.map((field: any) => `${spaces}  ${field.name}: ${this.astToString(field.value, indent + 1)}`).join('\n')}`;
      case 'accessor':
        return `${spaces}Accessor: @${expr.field}`;
      default:
        return `${spaces}${expr.kind}: ${JSON.stringify(expr)}`;
    }
  }

  private showTypeEnvironment(): void {
    const typeEnv = this.typer.getTypeEnvironment();
    console.log('Type Environment:');
    for (const [name, type] of typeEnv) {
      console.log(`  ${name}: ${this.typeToString(type)}`);
    }
  }
}

// Start the REPL if this file is run directly
if (typeof require !== 'undefined' && require.main === module) {
  const repl = new REPL();
  repl.start();
} 