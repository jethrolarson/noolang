#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simple REPL test scenarios
const SCENARIOS = [
  {
    name: 'Basic Arithmetic',
    inputs: ['1 + 2', '10 * 5', '100 / 4'],
    expectedOutputs: ['3', '50', '25']
  },
  {
    name: 'String Operations', 
    inputs: ['"hello" ++ " world"', '"test"'],
    expectedOutputs: ['hello world', 'test']
  },
  {
    name: 'Variable Assignment',
    inputs: ['let x = 42', 'x', 'let y = x * 2', 'y'],
    expectedOutputs: ['42', '84']
  },
  {
    name: 'Function Definition',
    inputs: ['let add = \\x y -> x + y', 'add 3 7', 'add 10 20'],
    expectedOutputs: ['10', '30']
  },
  {
    name: 'List Operations',
    inputs: ['[1, 2, 3]', 'head [5, 6, 7]', 'tail [1, 2, 3]'],
    expectedOutputs: ['[1, 2, 3]', '5', '[2, 3]']
  }
];

class SimpleREPLTester {
  constructor() {
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
  }

  async runTest(scenario) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    return new Promise((resolve) => {
      const replPath = path.join(__dirname, '..', 'src', 'repl.ts');
      const child = spawn('npx', ['ts-node', replPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..')
      });

      let output = '';
      let inputIndex = 0;
      let testsPassed = 0;
      let testsTotal = scenario.inputs.length;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Check if REPL is ready for input (look for prompt)
        if (text.includes('noo>') || text.includes('>')) {
          if (inputIndex < scenario.inputs.length) {
            const input = scenario.inputs[inputIndex];
            console.log(`   Input: ${input}`);
            child.stdin.write(input + '\n');
            inputIndex++;
          }
        }

        // Check for expected outputs
        scenario.expectedOutputs.forEach((expected, i) => {
          if (output.includes(expected)) {
            console.log(`   ✅ Found expected output: ${expected}`);
            testsPassed++;
          }
        });
      });

      child.stderr.on('data', (data) => {
        // Ignore stderr for now, focus on stdout
      });

      // Send quit after a delay to end the session
      setTimeout(() => {
        child.stdin.write('.quit\n');
        
        setTimeout(() => {
          const passed = testsPassed > 0;
          const result = {
            scenario: scenario.name,
            passed,
            totalExpected: testsTotal,
            foundOutputs: testsPassed,
            output: output.slice(0, 500) // Keep first 500 chars for debugging
          };
          
          this.results.push(result);
          this.totalTests++;
          if (passed) this.passedTests++;
          
          console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'} (${testsPassed}/${testsTotal} outputs found)`);
          resolve(result);
        }, 1000);
      }, 3000);

      child.on('error', (err) => {
        console.log(`   ❌ Error: ${err.message}`);
        resolve({ scenario: scenario.name, passed: false, error: err.message });
      });
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Simple REPL Automated Tests\n');
    
    for (const scenario of SCENARIOS) {
      await this.runTest(scenario);
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('═'.repeat(50));
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests}`);
    console.log(`Failed: ${this.totalTests - this.passedTests}`);
    console.log(`Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.scenario}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Save results to file
    const resultsDir = 'test-results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    const resultsFile = path.join(resultsDir, `repl-test-${timestamp}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        total: this.totalTests,
        passed: this.passedTests,
        failed: this.totalTests - this.passedTests,
        successRate: (this.passedTests / this.totalTests) * 100
      },
      results: this.results
    }, null, 2));

    console.log(`\n💾 Results saved to: ${resultsFile}`);
    console.log('\n🎉 REPL testing complete!');
  }
}

// Run the tests if this script is called directly
if (require.main === module) {
  const tester = new SimpleREPLTester();
  tester.runAllTests().catch(console.error);
}

module.exports = SimpleREPLTester;