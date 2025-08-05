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
	// Create temporary directory structure
	if (!fs.existsSync('test_dir')) {
		fs.mkdirSync('test_dir');
	}
	if (!fs.existsSync('test_dir/subdir')) {
		fs.mkdirSync('test_dir/subdir');
	}
	
	const mathModuleContent = '{ @mathAdd fn x y => x + y, @mathMultiply fn x y => x * y }';
	fs.writeFileSync('test_dir/math_functions.noo', mathModuleContent);
	
	// Save current directory and change to subdir for the test
	const originalDir = process.cwd();
	
	try {
		process.chdir('test_dir/subdir');
		const testCode = `
			math = import "../math_functions";
			(@mathAdd math) 10 20
		`;
		const result = runCode(testCode);
		expect(result.finalValue).toEqual(30);
	} finally {
		// Restore directory and clean up
		process.chdir(originalDir);
		if (fs.existsSync('test_dir/math_functions.noo')) {
			fs.unlinkSync('test_dir/math_functions.noo');
		}
		if (fs.existsSync('test_dir/subdir')) {
			fs.rmdirSync('test_dir/subdir');
		}
		if (fs.existsSync('test_dir')) {
			fs.rmdirSync('test_dir');
		}
	}
});

test('should handle absolute paths', () => {
	// Create temporary math_functions.noo file
	const mathModuleContent = '{ @mathAdd fn x y => x + y, @mathMultiply fn x y => x * y }';
	const absolutePath = path.resolve('math_functions_abs.noo');
	fs.writeFileSync(absolutePath, mathModuleContent);
	
	try {
		const testCode = `
			math = import "${absolutePath.replace(/\\/g, '/')}";
			(@mathAdd math) 5 10
		`;
		const result = runCode(testCode);
		expect(result.finalValue).toEqual(15);
	} finally {
		// Clean up
		if (fs.existsSync(absolutePath)) {
			fs.unlinkSync(absolutePath);
		}
	}
});

test('should fall back to current working directory when no file path provided', () => {
	// Create temporary math_functions.noo file in current directory
	const mathModuleContent = '{ @mathAdd fn x y => x + y, @mathMultiply fn x y => x * y }';
	fs.writeFileSync('math_functions.noo', mathModuleContent);
	
	try {
		const testCode = `
			math = import "math_functions";
			(@mathAdd math) 3 7
		`;
		const result = runCode(testCode);
		expect(result.finalValue).toEqual(10);
	} finally {
		// Clean up
		if (fs.existsSync('math_functions.noo')) {
			fs.unlinkSync('math_functions.noo');
		}
	}
});

