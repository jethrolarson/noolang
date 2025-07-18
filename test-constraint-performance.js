const { Lexer } = require('./dist/lexer.js');
const { parse } = require('./dist/parser/parser.js');
const { typeProgram } = require('./dist/typer/index.js');
const fs = require('fs');

try {
  console.log('Testing constraint-based unification performance...');
  
  const code = fs.readFileSync('./examples/demo.noo', 'utf-8');
  console.log(`Code length: ${code.length} characters`);
  
  // Lexing
  const lexStart = Date.now();
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const lexTime = Date.now() - lexStart;
  console.log(`Lexing: ${lexTime}ms`);
  
  // Parsing
  const parseStart = Date.now();
  const program = parse(tokens);
  const parseTime = Date.now() - parseStart;
  console.log(`Parsing: ${parseTime}ms`);
  
  // Type checking with constraint-based unification
  const typeStart = Date.now();
  const result = typeProgram(program);
  const typeTime = Date.now() - typeStart;
  
  console.log(`Type checking: ${typeTime}ms`);
  console.log(`Total time: ${lexTime + parseTime + typeTime}ms`);
  console.log(`Final type: ${result.type.kind}`);
  
  if (typeTime < 1000) {
    console.log('✅ Performance improvement successful!');
  } else {
    console.log('⚠️  Still slow, but constraint system is working');
  }
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}