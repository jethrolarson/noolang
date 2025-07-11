import * as readline from 'readline';
import { Parser } from './parser';
import { Evaluator } from './evaluator';
import { Typer } from './typer';

class REPL {
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

    if (input === ':quit' || input === ':exit') {
      this.rl.close();
      return;
    }

    if (input === ':help') {
      this.showHelp();
      return;
    }

    if (input === ':env') {
      this.showEnvironment();
      return;
    }

    if (input === ':types') {
      this.showTypeEnvironment();
      return;
    }

    try {
      // Parse the input
      const parser = new Parser(input);
      const program = parser.parse();

      // Type check the program
      const types = this.typer.typeProgram(program);

      // Evaluate the program
      const results = this.evaluator.evaluateProgram(program);

      // Print results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const type = types[i];
        
        if (result !== undefined) {
          console.log(`Result: ${this.valueToString(result)}`);
          if (type) {
            console.log(`Type: ${this.typeToString(type)}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
    }
  }

  private valueToString(value: any): string {
    if (typeof value === 'function') {
      return '<function>';
    } else if (value && typeof value === 'object' && 'kind' in value && value.kind === 'native') {
      return `<native:${value.name}>`;
    } else if (Array.isArray(value)) {
      return `[${value.map(this.valueToString).join(', ')}]`;
    } else {
      return String(value);
    }
  }

  private typeToString(type: any): string {
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
    console.log('  :help     - Show this help message');
    console.log('  :env      - Show current environment');
    console.log('  :types    - Show type environment');
    console.log('  :quit     - Exit the REPL');
    console.log('  :exit     - Exit the REPL');
    console.log('');
    console.log('Examples:');
    console.log('  add = (x, y) => x + y;');
    console.log('  add 2 3');
    console.log('  [1, 2, 3] |> head');
    console.log('  if true then 1 else 2');
  }

  private showEnvironment(): void {
    const env = this.evaluator.getEnvironment();
    console.log('Current Environment:');
    for (const [name, value] of env) {
      console.log(`  ${name}: ${this.valueToString(value)}`);
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