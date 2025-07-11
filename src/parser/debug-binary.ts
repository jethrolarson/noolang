import { Lexer } from '../lexer';
import { parse } from './parser';

const testCases = [
  '2 + 3',
  '1 + 2 * 3',
  'add 2 3'
];

for (const testCase of testCases) {
  console.log(`\n=== ${testCase} ===`);
  const lexer = new Lexer(testCase);
  const tokens = lexer.tokenize();
  console.log('Tokens:', tokens.map(t => `${t.type}('${t.value}')`).join(' '));
  
  try {
    const ast = parse(tokens);
    console.log('AST:', JSON.stringify(ast, null, 2));
  } catch (error) {
    console.log('Error:', error instanceof Error ? error.message : String(error));
  }
} 