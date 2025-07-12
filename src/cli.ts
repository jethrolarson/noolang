#!/usr/bin/env node
import { Lexer } from './lexer';
import { parse } from './parser/parser';
import { Evaluator } from './evaluator';
import * as fs from 'fs';
import * as path from 'path';

function printUsage() {
  console.log('Usage: noo <file.noo>');
  console.log('       noo --eval <expr>');
  console.log('       noo -e <expr>');
  console.log('       noo --tokens <expr>');
  console.log('       noo --ast <expr>');
  console.log('       noo --tokens-file <file>');
  console.log('       noo --ast-file <file>');
  console.log('');
  console.log('Examples:');
  console.log('  noo my_program.noo');
  console.log('  noo examples/basic.noo');
  console.log('  noo --eval "1 + 2 * 3"');
  console.log('  noo -e "x = 10; x * 2"');
  console.log('  noo --tokens "{ @add fn x y => x + y }"');
  console.log('  noo --ast "if x > 0 then x else -x"');
  console.log('  noo --tokens-file std/math.noo');
  console.log('  noo --ast-file std/math.noo');
  console.log('');
  console.log('Or use the REPL:');
  console.log('  noo');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // No file provided, start REPL
    console.log('Noolang REPL');
    console.log('Type ":exit" or ":quit" to quit');
    console.log('');
    // Import and start REPL
    const { REPL } = await import('./repl');
    const repl = new REPL();
    repl.start();
    return;
  }

  // Check for --tokens flag
  if (args[0] === '--tokens' && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      console.log('Tokens:');
      tokens.forEach((token, i) => {
        console.log(`  ${i}: ${token.type}('${token.value}')`);
      });
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --tokens-file flag
  if (args[0] === '--tokens-file' && args[1]) {
    const file = args[1];
    try {
      const fullPath = path.resolve(file);
      const code = fs.readFileSync(fullPath, 'utf8');
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      console.log('Tokens:');
      tokens.forEach((token, i) => {
        console.log(`  ${i}: ${token.type}('${token.value}')`);
      });
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --ast flag
  if (args[0] === '--ast' && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      console.log('AST:');
      console.log(JSON.stringify(program, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --ast-file flag
  if (args[0] === '--ast-file' && args[1]) {
    const file = args[1];
    try {
      const fullPath = path.resolve(file);
      const code = fs.readFileSync(fullPath, 'utf8');
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      console.log('AST:');
      console.log(JSON.stringify(program, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --eval or -e flag
  if ((args[0] === '--eval' || args[0] === '-e') && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const evaluator = new Evaluator();
      const result = evaluator.evaluateProgram(program);
      console.log(result.finalResult);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // If not --eval, treat as file
  const file = args[0];
  if (!file) {
    printUsage();
    process.exit(1);
  }

  try {
    const fullPath = path.resolve(file);
    const code = fs.readFileSync(fullPath, 'utf8');
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    const result = evaluator.evaluateProgram(program);
    console.log(result.finalResult);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

main(); 