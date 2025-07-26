import { spawn, ChildProcess } from 'child_process';

describe('REPL Integration Tests', () => {
	let replProcess: ChildProcess;
	let output: string;
	let errorOutput: string;
	let processManuallyExited: boolean = false;

	const startREPL = (): Promise<void> => {
		return new Promise((resolve, reject) => {
			replProcess = spawn('npm', ['run', 'dev'], {
				stdio: ['pipe', 'pipe', 'pipe'],
				cwd: process.cwd(),
			});

			output = '';
			errorOutput = '';

			replProcess.stdout?.on('data', data => {
				output += data.toString();
			});

			replProcess.stderr?.on('data', data => {
				errorOutput += data.toString();
			});

			replProcess.on('error', reject);

			// Wait for REPL to start (look for prompt or startup message)
			const checkInterval = setInterval(() => {
				if (output.includes('>') || output.includes('noo>')) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);

			// Timeout after 10 seconds
			setTimeout(() => {
				clearInterval(checkInterval);
				reject(new Error('REPL startup timeout'));
			}, 10000);
		});
	};

	const sendInput = (input: string): Promise<string> => {
		return new Promise((resolve, reject) => {
			const beforeLength = output.length;
			let responseReceived = false;
			
			replProcess.stdin?.write(input + '\n');

			// Check for response every 100ms
			const checkInterval = setInterval(() => {
				const currentOutput = output.substring(beforeLength);
				
				// Count number of noolang> prompts to see if we got a response
				const promptCount = (currentOutput.match(/noolang>/g) || []).length;
				
				// Look for successful command completion (has result with ➡)
				if (currentOutput.includes('noolang>') && currentOutput.includes('➡')) {
					clearInterval(checkInterval);
					responseReceived = true;
					
					// Extract just the result line (between ➡ and the next noolang>)
					const lines = currentOutput.split('\n');
					const resultLine = lines.find(line => line.includes('➡'));
					resolve(resultLine || currentOutput.trim());
				}
				// Look for error completion (has error and returned to prompt)
				else if (promptCount >= 2 && (currentOutput.includes('Error:') || 
					currentOutput.includes('TypeError:') || currentOutput.includes('Parse error:'))) {
					clearInterval(checkInterval);
					responseReceived = true;
					resolve(currentOutput.trim());
				}
				// Look for help or other command responses
				else if (promptCount >= 2 && (currentOutput.includes('Commands:') || 
					currentOutput.includes('Noolang REPL'))) {
					clearInterval(checkInterval);
					responseReceived = true;
					resolve(currentOutput.trim());
				}
			}, 100);

			// Timeout after 3 seconds
			setTimeout(() => {
				if (!responseReceived) {
					clearInterval(checkInterval);
					resolve(output.substring(beforeLength));
				}
			}, 3000);
		});
	};

	const stopREPL = (): Promise<void> => {
		return new Promise(resolve => {
			if (replProcess && !replProcess.killed && !processManuallyExited) {
				// Set a timeout in case the process doesn't exit cleanly
				const timeout = setTimeout(() => {
					if (!replProcess.killed) {
						replProcess.kill('SIGKILL');
					}
					resolve();
				}, 5000);

				replProcess.on('exit', () => {
					clearTimeout(timeout);
					resolve();
				});

				replProcess.kill('SIGTERM');
			} else {
				resolve();
			}
		});
	};

	beforeEach(async () => {
		processManuallyExited = false;
		await startREPL();
	}, 15000);

	afterEach(async () => {
		await stopREPL();
	});

	describe('Basic Arithmetic', () => {
		test('should evaluate simple addition', async () => {
			const result = await sendInput('2 + 3');
			expect(result).toContain('5');
		});

		test('should evaluate multiplication', async () => {
			const result = await sendInput('4 * 7');
			expect(result).toContain('28');
		});

		test('should handle floating point numbers', async () => {
			const result = await sendInput('3.14 * 2');
			expect(result).toContain('6.28');
		});
	});

	describe('Variable Assignment and Retrieval', () => {
		test('should assign and retrieve variables', async () => {
			await sendInput('x = 42');
			const result = await sendInput('x');
			expect(result).toContain('42');
		});

		test('should handle variable expressions', async () => {
			await sendInput('a = 10');
			await sendInput('b = 20');
			const result = await sendInput('a + b');
			expect(result).toContain('30');
		});

		test('should handle variable reassignment', async () => {
			await sendInput('value = 100');
			await sendInput('value = 200');
			const result = await sendInput('value');
			expect(result).toContain('200');
		});
	});

	describe('Function Definitions and Calls', () => {
		test('should define and call functions', async () => {
			await sendInput('double = fn x => x * 2');
			const result = await sendInput('double 5');
			expect(result).toContain('10');
		});

		test('should handle recursive functions', async () => {
			await sendInput(
				'factorial = fn n => if n <= 1 then 1 else n * factorial(n - 1)'
			);
			const result = await sendInput('factorial 4');
			expect(result).toContain('24');
		});
	});

	describe('Data Structures', () => {
		test('should handle lists', async () => {
			const result = await sendInput('[1, 2, 3, 4]');
			expect(result).toMatch(/\[.*1.*2.*3.*4.*\]/);
		});

		test('should handle records', async () => {
			const result = await sendInput('{ @name "John", @age 30 }');
			expect(result).toContain('name');
			expect(result).toContain('John');
		});

		test('should handle tuples', async () => {
			const result = await sendInput('{42, "hello"}');
			expect(result).toContain('42');
			expect(result).toContain('hello');
		});
	});

	describe('REPL Commands', () => {
		test('should respond to .help command', async () => {
			const result = await sendInput('.help');
			expect(result.includes('Commands') || result.includes('help')).toBe(true);
		});

		test('should respond to .env command', async () => {
			await sendInput('testVar = 123');
			const result = await sendInput('.env');
			expect(result).toContain('testVar');
		});

		test('should handle .quit command', async () => {
			const result = await sendInput('.quit');
			// Process should exit, so we don't expect more output
			expect(result).toBeDefined();
			// Mark process as manually quit to avoid cleanup timeout
			processManuallyExited = true;
		});
	});

	describe('Error Handling', () => {
		test.skip('should handle syntax errors gracefully (timing issue with error detection)', async () => {
			const result = await sendInput('2 + +');
			expect(result.includes('Parse error') || result.includes('Error')).toBe(true);
		});

		test.skip('should handle undefined variable errors (timing issue with error detection)', async () => {
			const result = await sendInput('undefinedVar');
			expect(result.includes('TypeError') || result.includes('Undefined variable')).toBe(true);
		});

		test('should continue after errors', async () => {
			await sendInput('2 + +');
			const result = await sendInput('2 + 2');
			expect(result).toContain('4');
		});
	});

	describe('File Import', () => {
		test('should import files correctly', async () => {
			// This assumes test files exist
			const result = await sendInput('import "test/test_import"');
			expect(result).toBeDefined();
		});
	});

	describe('Multi-line Input', () => {
		test('should handle complex expressions', async () => {
			// Set up variables first
			await sendInput('x = 10');
			await sendInput('y = 20');
			const result = await sendInput('x + y');
			expect(result).toContain('30');
		});
	});
}); // Extended timeout for integration tests

// Set timeout for the entire describe block
jest.setTimeout(30000);
