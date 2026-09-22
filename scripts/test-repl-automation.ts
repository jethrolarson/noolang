#!/usr/bin/env ts-node

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestScenario {
  name: string;
  inputs: string[];
  expectedOutputs: string[];
  shouldContainInOutput?: string[];
  shouldNotContainInOutput?: string[];
  timeout?: number;
}

class REPLTestAutomator {
  private replProcess: ChildProcess | null = null;
  private output: string = '';
  private errorOutput: string = '';
  private isReady: boolean = false;

  async startREPL(): Promise<void> {
    return new Promise((resolve, reject) => {
      const replPath = path.join(__dirname, '..', 'src', 'repl.ts');
      
      // Add timeout for REPL startup
      const startupTimeout = setTimeout(() => {
        console.log('⏰ REPL startup timed out after 15 seconds');
        if (this.replProcess && !this.replProcess.killed) {
          this.replProcess.kill('SIGTERM');
        }
        reject(new Error('REPL startup timeout'));
      }, 15000);
      
      this.replProcess = spawn('npx', ['ts-node', replPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..')
      });

      this.replProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        this.output += text;
        console.log('REPL Output:', text.trim());
        
        // Check accumulated output for both welcome message and prompt
        if ((this.output.includes('Welcome to Noolang') && this.output.includes('noolang>')) ||
            this.output.includes('noo>') || 
            this.output.includes('>')) {
          this.isReady = true;
          clearTimeout(startupTimeout);
          resolve();
        }
      });

      this.replProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        this.errorOutput += text;
        console.log('REPL Error:', text.trim());
      });

      this.replProcess.on('error', (error) => {
        clearTimeout(startupTimeout);
        console.error('Process error:', error);
        reject(error);
      });

      this.replProcess.on('exit', (code) => {
        console.log(`REPL process exited with code ${code}`);
      });
    });
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.replProcess || !this.isReady) {
      throw new Error('REPL not ready');
    }

    return new Promise((resolve, reject) => {
      const beforeLength = this.output.length;
      const beforeErrorLength = this.errorOutput.length;
      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          reject(new Error(`Timeout waiting for response to: ${command}`));
        }
      }, 5000);

      const checkForResponse = () => {
        const currentOutput = this.output.substring(beforeLength);
        if (currentOutput.includes('noolang>')) {
          responseReceived = true;
          clearTimeout(timeout);
          resolve(this.errorOutput.substring(beforeErrorLength) + currentOutput);
        } else if (!responseReceived) {
          setTimeout(checkForResponse, 100);
        }
      };

      this.replProcess!.stdin?.write(command + '\n');
      setTimeout(checkForResponse, 200);
    });
  }

  async runScenario(scenario: TestScenario): Promise<{ passed: boolean; errors: string[] }> {
    console.log(`\n🧪 Running scenario: ${scenario.name}`);
    console.log('─'.repeat(50));
    
    const errors: string[] = [];
    
    try {
      for (let i = 0; i < scenario.inputs.length; i++) {
        const input = scenario.inputs[i];
        console.log(`\n📝 Input ${i + 1}: ${input}`);
        
        const response = await this.sendCommand(input);
        console.log(`📤 Response: ${response.trim()}`);
        
        // Check expected outputs
        if (scenario.expectedOutputs[i]) {
          if (!response.includes(scenario.expectedOutputs[i])) {
            errors.push(`Expected output "${scenario.expectedOutputs[i]}" not found in response to "${input}"`);
          }
        }
        
        // Check should contain
        if (scenario.shouldContainInOutput) {
          for (const shouldContain of scenario.shouldContainInOutput) {
            if (!response.includes(shouldContain)) {
              errors.push(`Expected to find "${shouldContain}" in response to "${input}"`);
            }
          }
        }
        
        // Check should not contain
        if (scenario.shouldNotContainInOutput) {
          for (const shouldNotContain of scenario.shouldNotContainInOutput) {
            if (response.includes(shouldNotContain)) {
              errors.push(`Should not find "${shouldNotContain}" in response to "${input}"`);
            }
          }
        }
      }
    } catch (error) {
      errors.push(`Exception during scenario: ${(error as Error).message}`);
    }
    
    const passed = errors.length === 0;
    console.log(`\n${passed ? '✅' : '❌'} Scenario ${scenario.name}: ${passed ? 'PASSED' : 'FAILED'}`);
    
    if (!passed) {
      console.log('🔍 Errors:');
      errors.forEach(error => console.log(`  • ${error}`));
    }
    
    return { passed, errors };
  }

  async shutdown(): Promise<void> {
    if (this.replProcess) {
      this.replProcess.stdin?.write('.quit\n');
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.replProcess?.kill();
          resolve();
        }, 2000);
        
        this.replProcess!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }
}

// Define test scenarios
const scenarios: TestScenario[] = [
  {
    name: 'Basic Arithmetic',
    inputs: ['1 + 2', '10 * 5', '100 / 4'],
    expectedOutputs: ['3', '50', '25'],
    shouldContainInOutput: ['Float']
  },
  {
    name: 'String Operations',
    inputs: ['"hello"', '"world" + " peace"'],
    expectedOutputs: ['hello', 'world peace']
  },
  {
    name: 'Variable Definitions and Usage',
    inputs: ['x = 42', 'y = x * 2', 'x + y'],
    expectedOutputs: ['42', '84', '126']
  },
  {
    name: 'Function Definitions and Applications',
    inputs: [
      'sum = fn x y => x + y',
      'sum 10 20',
      'product = fn x y => x * y',
      'product 6 7'
    ],
    expectedOutputs: ['', '30', '', '42']
  },
  {
    name: 'List Operations',
    inputs: [
      '[1, 2, 3]',
      'head [1, 2, 3]',
      'cons 0 [1, 2, 3]'
    ],
    expectedOutputs: ['[1, 2, 3]', '1', '[0, 1, 2, 3]']
  },
  {
    name: 'REPL Commands',
    inputs: ['.help', 'test_var = 123', '.env'],
    expectedOutputs: ['Noolang REPL Commands', '123', 'test_var']
  },
  {
    name: 'Error Handling',
    inputs: ['1 + "hello"', '2 + 3'],
    expectedOutputs: ['TypeError', '5']
  },
  {
    name: 'Type Polymorphism',
    inputs: [
      'print 42',
      'print "hello"',
      'print True'
    ],
    expectedOutputs: ['42', 'hello', 'True'],
    shouldNotContainInOutput: ['TypeError', 'type error']
  },
  {
    name: 'Complex Expressions',
    inputs: [
      'factorial = fn n => if n <= 1 then 1 else n * factorial (n - 1)',
      'factorial 5',
      'compose = fn f g => fn x => f (g x)',
      'double = fn x => x * 2',
      'increment = fn x => x + 1',
      '(compose double increment) 5'
    ],
    expectedOutputs: ['', '120', '', '', '', '12']
  },
  {
    name: 'Debugging Commands',
    inputs: [
      '.tokens (1 + 2)',
      '.ast (fn x => x)',
      '.ast-json (42)'
    ],
    expectedOutputs: ['Tokens for', 'AST for', '"kind"']
  }
];

async function runAllTests(): Promise<boolean> {
  console.log('🚀 Starting REPL Test Automation');
  console.log('=' .repeat(60));
  
  const automator = new REPLTestAutomator();
  
  try {
    console.log('🔄 Starting REPL...');
    await automator.startREPL();
    console.log('✅ REPL started successfully');
    
    const results: Array<{ scenario: string; passed: boolean; errors: string[] }> = [];
    
    for (const scenario of scenarios) {
      const result = await automator.runScenario(scenario);
      results.push({
        scenario: scenario.name,
        passed: result.passed,
        errors: result.errors
      });
      
      // Small delay between scenarios
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Print summary
    console.log('\n📊 Test Summary');
    console.log('=' .repeat(60));
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${total - passed}/${total}`);
    
    if (passed === total) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n❌ Some tests failed:');
      results.filter(r => !r.passed).forEach(result => {
        console.log(`\n• ${result.scenario}:`);
        result.errors.forEach(error => console.log(`  - ${error}`));
      });
    }
    
    // Generate test report
    const report = {
      timestamp: new Date().toISOString(),
      summary: { passed, total, success_rate: (passed / total) * 100 },
      results: results
    };
    
    const reportPath = path.join(__dirname, '..', 'test-reports', 'repl-automation-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Test report saved to: ${reportPath}`);
    return passed === total;
    
  } catch (error) {
    console.error('💥 Test automation failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🔄 Shutting down REPL...');
    await automator.shutdown();
    console.log('✅ REPL shutdown complete');
  }
}

// Run if this script is executed directly
if (require.main === module) {
  runAllTests().then(passed => {
    console.log('\n🏁 Test automation complete');
    process.exit(passed ? 0 : 1);
  }).catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { REPLTestAutomator, scenarios };