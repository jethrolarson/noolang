const { Lexer } = require('./dist/lexer/lexer');
const { parse } = require('./dist/parser/parser');
const { typeProgram } = require('./dist/typer/index');
const { typeToString } = require('./dist/typer/helpers');

// Test the issue: map (fn a => a + 1) [1] should type as List Int, not retain constraint
const code = 'map (fn a => a + 1) [1]';

console.log('Testing expression:', code);

try {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    
    const typeResult = typeProgram(program);
    
    console.log('Type kind:', typeResult.type.kind);
    console.log('Type string:', typeToString(typeResult.type));
    
    if (typeResult.type.kind === 'constrained') {
        console.log('Base type:', typeToString(typeResult.type.baseType));
        console.log('Constraints:', Array.from(typeResult.type.constraints.entries()));
    }
    
} catch (error) {
    console.error('Error:', error.message);
}