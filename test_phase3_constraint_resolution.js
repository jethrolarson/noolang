const { Lexer } = require('./dist/lexer/lexer');
const { parse } = require('./dist/parser/parser');
const { typeProgram } = require('./dist/typer/index');

// Test the specific failing case mentioned in the design document:
// map (fn x => x + 1) [1,2,3] should work but currently fails

console.log('Testing Phase 3 constraint resolution...');

try {
  // This is the exact failing case from the design document:
  // The issue is that when type checking `map (fn x => x + 1) [1,2,3]`,
  // the system can't resolve that α = List from the constraint α implements Functor
  const code = `result = map (fn x => x + 1) [1,2,3]`;

  console.log('Code:', code);
  
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  console.log('Parsed successfully');
  
  const typeResult = typeProgram(program);
  
  console.log('✅ SUCCESS: Constraint resolution working!');
  console.log('Result type:', typeResult.type);
  
} catch (error) {
  console.log('❌ EXPECTED FAILURE: Constraint resolution not yet implemented');
  console.log('Error:', error.message);
  console.log('\nThis is the core Phase 3 issue: Cannot unify constrained type with concrete type');
  console.log('Expected: (α Int) -> α Int given α implements Functor cannot unify with List Int');
  console.log('Solution: During unification, resolve α = List from implement Functor List');
}

// Test a simpler case that should already work (using stdlib)
try {
  const simpleCode = `result = show 42`;

  console.log('\n\nTesting simple case that should work...');
  console.log('Code:', simpleCode);
  
  const lexer = new Lexer(simpleCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  
  const typeResult = typeProgram(program);
  
  console.log('✅ Simple case works!');
  console.log('Result type:', typeResult.type);
  
} catch (error) {
  console.log('❌ Simple case failed:', error.message);
}