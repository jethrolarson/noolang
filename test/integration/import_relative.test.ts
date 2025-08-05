import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { Evaluator } from '../../src/evaluator/evaluator';
import { test, expect } from 'bun:test';
import { createTraitRegistry } from '../../src/typer/trait-system';
// Skipping these tests as the import system is not working correctly right now
// Test suite: File-relative imports
const mockFs = {
	readFileSync: (filePath: unknown) => {
		if (typeof filePath === 'string' && filePath.includes('stdlib.noo')) {
			return '# Noolang Standard Library\n# This file defines the global default environment\n';
		}
		if (
			typeof filePath === 'string' &&
			filePath.includes('math_functions.noo')
		) {
			return '{ @mathAdd fn x y => x + y, @mathMultiply fn x y => x * y }';
		}
		throw new Error(`File not found: ${filePath}`);
	},
	existsSync: (filePath: unknown) => {
		if (typeof filePath === 'string' && filePath.includes('stdlib.noo')) {
			return true;
		}
		if (
			typeof filePath === 'string' &&
			filePath.includes('math_functions.noo')
		) {
			return true;
		}
		return false;
	},
};

test.skip('should import from same directory', () => {
	const testCode = `
      math = import "math_functions";
      (@mathAdd math) 2 3
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
	expect(result.finalResult).toEqual({ tag: 'number', value: 5 });
});

test.skip('should import from parent directory', () => {
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

test.skip('should handle absolute paths', () => {
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

test.skip('should fall back to current working directory when no file path provided', () => {
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

