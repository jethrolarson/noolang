#!/usr/bin/env node
import { Lexer } from './lexer';
import { parse } from './parser/parser';
import { Evaluator } from './evaluator';
import * as fs from 'fs';
import * as path from 'path';

function printUsage() {
  console.log('Usage: noo <file.noo>');
  console.log('');
  console.log('Examples:');
  console.log('  noo my_program.noo');
  console.log('  noo examples/basic.noo');
  console.log('');
  console.log('Or use the REPL:');
  console.log('  noo');
}

async function main() {
  const file = process.argv[2];
  if (!file) {
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