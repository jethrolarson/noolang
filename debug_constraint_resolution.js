const { Lexer } = require('./dist/lexer/lexer');
const { parse } = require('./dist/parser/parser');
const { typeProgram, typeExpression } = require('./dist/typer/index');
const { typeToString } = require('./dist/typer/helpers');

// Let's step through exactly what's happening with map
console.log('=== DEBUG: Constraint Resolution Flow ===\n');

// First, let's see what type `map` has
try {
  console.log('1. Testing just the `map` function reference:');
  const mapCode = 'result = map';
  
  const lexer = new Lexer(mapCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  console.log('   map type:', JSON.stringify(typeResult.type, null, 2));
  console.log('   map type string:', typeToString(typeResult.type));
  
} catch (error) {
  console.log('   Error:', error.message);
}

console.log('\n2. Testing the increment function:');
try {
  const incCode = 'result = fn x => x + 1';
  
  const lexer = new Lexer(incCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  console.log('   increment type:', JSON.stringify(typeResult.type, null, 2));
  console.log('   increment type string:', typeToString(typeResult.type));
  
} catch (error) {
  console.log('   Error:', error.message);
}

console.log('\n3. Testing the list literal:');
try {
  const listCode = 'result = [1,2,3]';
  
  const lexer = new Lexer(listCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  console.log('   list type:', JSON.stringify(typeResult.type, null, 2));
  console.log('   list type string:', typeToString(typeResult.type));
  
} catch (error) {
  console.log('   Error:', error.message);
}

console.log('\n4. Testing partial application map increment:');
try {
  const partialCode = 'result = map (fn x => x + 1)';
  
  const lexer = new Lexer(partialCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  console.log('   partial application type:', JSON.stringify(typeResult.type, null, 2));
  console.log('   partial application type string:', typeToString(typeResult.type));
  
  // Debug the constraints
  if (typeResult.type.kind === 'constrained') {
    console.log('   constraints map size:', typeResult.type.constraints.size);
    console.log('   constraints entries:');
    for (const [key, value] of typeResult.type.constraints) {
      console.log('     ', key, '→', value);
    }
  }
  
} catch (error) {
  console.log('   Error:', error.message);
}

console.log('\n5. Now the failing case:');
try {
  const failingCode = 'result = map (fn x => x + 1) [1,2,3]';
  
  const lexer = new Lexer(failingCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  console.log('   SUCCESS! Type:', JSON.stringify(typeResult.type, null, 2));
  console.log('   Type string:', typeToString(typeResult.type));
  
} catch (error) {
  console.log('   ERROR:', error.message);
}