const { Lexer } = require('./dist/lexer');
const { Parser } = require('./dist/parser');
const { Evaluator } = require('./dist/evaluator');

console.log('=== Tokens for fn syntax ===');
const lexer = new Lexer('add = fn x y => x + y;');
const tokens = lexer.tokenize();
console.log(tokens.map(t => ({ type: t.type, value: t.value })));

console.log('\n=== Function Definition with fn syntax ===');
const parser1 = new Parser('add = fn x y => x + y;');
const program1 = parser1.parse();

// Debug the function structure
const def = program1.statements[0];
if (def.kind === 'definition' && def.value.kind === 'function') {
  console.log('Outer function params:', def.value.params);
  if (def.value.body.kind === 'function') {
    console.log('Inner function params:', def.value.body.params);
  }
}

console.log(JSON.stringify(program1, null, 2));

console.log('\n=== List Operation Debug ===');
const parser2 = new Parser('[1 2 3] |> head');
const program2 = parser2.parse();
console.log('AST:', JSON.stringify(program2, null, 2));

const evaluator = new Evaluator();
const results = evaluator.evaluateProgram(program2);
console.log('Results:', results);
console.log('Result type:', typeof results[0]);
console.log('Result value:', results[0]); 