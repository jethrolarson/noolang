import { Lexer } from '../lexer';

const testCases = [
  '42',
  '"hello"',
  'x',
  'fn x => x + 1',
  '1 + 2 * 3',
  '[1, 2, 3]',
  'if true then 1 else 2',
  'x |> f |> g'
];

for (const testCase of testCases) {
  console.log(`\n=== ${testCase} ===`);
  const lexer = new Lexer(testCase);
  const tokens = lexer.tokenize();
  console.log('Tokens:', tokens.map(t => `${t.type}('${t.value}')`).join(' '));
} 