import { test, expect } from 'bun:test';
import { runCode } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

test('should import from same directory', () => {
	// Create temporary math_functions.noo file
	const mathModuleContent = '{ @mathAdd fn x y => x + y, @mathMultiply fn x y => x * y }';
	fs.writeFileSync('math_functions.noo', mathModuleContent);
	
	try {
		const testCode = `
      math = import "math_functions";
      (@mathAdd math) 2 3
    `;
		const result = runCode(testCode);
		expect(result.finalValue).toEqual(5);
	} finally {
		// Clean up
		if (fs.existsSync('math_functions.noo')) {
			fs.unlinkSync('math_functions.noo');
		}
	}
});

test('should import from parent directory', () => {
	const testCode = `
      math = import "../math_functions";
      (@mathAdd math) 10 20
    `;
	const lexer = new Lexer(testCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator({ 
		fs: mockFs as any,
		traitRegistry: createTraitRegistry()
	});
	const result = evaluator.evaluateProgram(
		program,
		'/test/dir/subdir/test_file.noo'
	);
	expect(result.finalResult).toEqual({ tag: 'number', value: 30 });
});

test('should handle absolute paths', () => {
	const testCode = `
      math = import "/absolute/path/math_functions";
      (@mathAdd math) 5 10
    `;
	const lexer = new Lexer(testCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator({ 
		fs: mockFs as any,
		traitRegistry: createTraitRegistry()
	});
	const result = evaluator.evaluateProgram(
		program,
		'/test/dir/test_file.noo'
	);
	expect(result.finalResult).toEqual({ tag: 'number', value: 15 });
});

test('should fall back to current working directory when no file path provided', () => {
	const testCode = `
      math = import "math_functions";
      (@mathAdd math) 3 7
    `;
	const lexer = new Lexer(testCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const evaluator = new Evaluator({ 
		fs: mockFs as any,
		traitRegistry: createTraitRegistry()
	});
	const result = evaluator.evaluateProgram(program); // No file path
	expect(result.finalResult).toEqual({ tag: 'number', value: 10 });
});

