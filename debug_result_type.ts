import { Lexer } from './src/lexer/lexer';
import { parse } from './src/parser/parser';
import { Evaluator } from './src/evaluator/evaluator';
import { typeProgram } from './src/typer';
import { typeToString } from './src/typer/helpers';

// Helper function to parse and evaluate Noolang code
const runNoolang = (source: string) => {
	console.log('🔍 Running code:', source.trim());
	
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	console.log('📝 Tokens:', tokens.slice(0, 10).map(t => `${t.type}:${t.value}`));
	
	const program = parse(tokens);
	console.log('🌳 AST:', JSON.stringify(program, null, 2).slice(0, 500) + '...');

	// Type check first
	const typeResult = typeProgram(program);
	console.log('🔧 Type result:', typeToString(typeResult.type, typeResult.state.substitution));

	// Then evaluate
	const evaluator = new Evaluator();
	const evalResult = evaluator.evaluateProgram(program);
	console.log('⚡ Eval result:', JSON.stringify(evalResult.finalResult, null, 2));

	return {
		typeResult,
		evalResult,
		finalType: typeToString(typeResult.type, typeResult.state.substitution),
		finalValue: evalResult.finalResult,
	};
};

console.log('=== Testing simple Result type definition ===');
try {
	const result1 = runNoolang(`
		type Result a b = Ok a | Err b;
		Ok 42
	`);
} catch (error) {
	console.log('❌ Error:', error.message);
}

console.log('\n=== Testing divide function ===');
try {
	const result2 = runNoolang(`
		type Result a b = Ok a | Err b;
		
		divide = fn x => fn y => 
		  if y == 0 then Err "Division by zero" else Ok (x / y);
		
		divide 10 2
	`);
} catch (error) {
	console.log('❌ Error:', error.message);
}