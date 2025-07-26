import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { Evaluator } from '../../src/evaluator/evaluator';

describe('File-relative imports', () => {
	const mockFs = {
		readFileSync: (filePath: unknown, encoding: string) => {
			if (typeof filePath === 'string' && filePath.includes('stdlib.noo')) {
				return '# Noolang Standard Library\n# This file defines the global default environment\n';
			}
			if (
				typeof filePath === 'string' &&
				filePath.includes('math_functions.noo')
			) {
				return '{ @add fn x y => x + y, @multiply fn x y => x * y }';
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

	test('should import from same directory', () => {
		const testCode = `
      math = import "math_functions";
      (@add math) 2 3
    `;
		const lexer = new Lexer(testCode);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator({ fs: mockFs as any });
		const result = evaluator.evaluateProgram(
			program,
			'/test/dir/test_file.noo'
		);
		expect(result.finalResult).toEqual({ tag: 'number', value: 5 });
	});

	test('should import from parent directory', () => {
		const testCode = `
      math = import "../math_functions";
      (@add math) 10 20
    `;
		const lexer = new Lexer(testCode);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator({ fs: mockFs as any });
		const result = evaluator.evaluateProgram(
			program,
			'/test/dir/subdir/test_file.noo'
		);
		expect(result.finalResult).toEqual({ tag: 'number', value: 30 });
	});

	test('should handle absolute paths', () => {
		const testCode = `
      math = import "/absolute/path/math_functions";
      (@add math) 5 10
    `;
		const lexer = new Lexer(testCode);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator({ fs: mockFs as any });
		const result = evaluator.evaluateProgram(
			program,
			'/test/dir/test_file.noo'
		);
		expect(result.finalResult).toEqual({ tag: 'number', value: 15 });
	});

	test('should fall back to current working directory when no file path provided', () => {
		const testCode = `
      math = import "math_functions";
      (@add math) 3 7
    `;
		const lexer = new Lexer(testCode);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const evaluator = new Evaluator({ fs: mockFs as any });
		const result = evaluator.evaluateProgram(program); // No file path
		expect(result.finalResult).toEqual({ tag: 'number', value: 10 });
	});
});
