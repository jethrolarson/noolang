#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simple REPL test scenarios
const SCENARIOS = [
  {
    name: 'Basic Arithmetic',
    inputs: ['1 + 2', '.quit'],
    expectedOutputs: ['3']
  },
  {
    name: 'String Operations', 
    inputs: ['"hello"', '.quit'],
    expectedOutputs: ['hello']
  },
  {
    name: 'Environment Check',
    inputs: ['.help', '.quit'],
    expectedOutputs: ['Commands']
  }
];

class SimpleREPLTester {
  constructor() {
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.testTimeout = 10000; // 10 second timeout per test
  }

  async runTest(scenario) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    return new Promise((resolve) => {
      const replPath = path.join(__dirname, '..', 'src', 'repl.ts');
      
      // Set up timeout for the entire test
      const testTimer = setTimeout(() => {
        console.log(`   ⏰ Test timed out after ${this.testTimeout/1000}s`);
        if (child && !child.killed) {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
        }
        resolve({ 
          scenario: scenario.name, 
          passed: false, 
          error: 'Test timeout',
          timedOut: true 
        });
      }, this.testTimeout);

      const child = spawn('npx', ['ts-node', replPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..'),
        timeout: this.testTimeout
      });

      let output = '';
      let inputIndex = 0;
      let testsPassed = 0;
      let testsTotal = scenario.expectedOutputs.length;
      let replReady = false;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`   📝 Output: ${text.trim()}`);
        
        // Check if REPL is ready for input
        if ((text.includes('noo>') || text.includes('>') || text.includes('Commands')) && !replReady) {
          replReady = true;
          console.log(`   ✅ REPL ready, starting inputs`);
        }
        
        // Send next input if REPL is ready
        if (replReady && inputIndex < scenario.inputs.length) {
          const input = scenario.inputs[inputIndex];
          console.log(`   ⌨️  Input: ${input}`);
          child.stdin.write(input + '\n');
          inputIndex++;
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
        console.log(`   ⚠️  Error output: ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        clearTimeout(testTimer);
        
        const passed = testsPassed > 0;
        const result = {
          scenario: scenario.name,
          passed,
          totalExpected: testsTotal,
          foundOutputs: testsPassed,
          exitCode: code,
          output: output.slice(0, 500) // Keep first 500 chars for debugging
        };
        
        this.results.push(result);
        this.totalTests++;
        if (passed) this.passedTests++;
        
        console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'} (${testsPassed}/${testsTotal} outputs found, exit code: ${code})`);
        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(testTimer);
        console.log(`   ❌ Process Error: ${err.message}`);
        const result = { 
          scenario: scenario.name, 
          passed: false, 
          error: err.message,
          processError: true 
        };
        this.results.push(result);
        this.totalTests++;
        resolve(result);
      });

      // Give the process a moment to start before timing out
      setTimeout(() => {
        if (!replReady) {
          console.log(`   ⚠️  REPL not ready after 5s, sending test input anyway`);
          if (scenario.inputs.length > 0) {
            child.stdin.write(scenario.inputs[0] + '\n');
            setTimeout(() => {
              child.stdin.write('.quit\n');
            }, 1000);
          }
        }
      }, 5000);
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Simple REPL Automated Tests (Fast Mode)\n');
    
    for (const scenario of SCENARIOS) {
      await this.runTest(scenario);
    }

    this.printSummary();
    
    // Exit with appropriate code
    const allPassed = this.passedTests === this.totalTests;
    process.exit(allPassed ? 0 : 1);
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('═'.repeat(50));
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests}`);
    console.log(`Failed: ${this.totalTests - this.passedTests}`);
    console.log(`Success Rate: ${this.totalTests > 0 ? ((this.passedTests / this.totalTests) * 100).toFixed(1) : 0}%`);
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.scenario}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.timedOut) {
        console.log(`   ⏰ Timed out`);
      }
      if (result.processError) {
        console.log(`   🚨 Process error`);
      }
    });

    // Save results to file
    const resultsDir = 'test-results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(resultsDir, `repl-test-${timestamp}.json`);
    
    try {
      fs.writeFileSync(resultsFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
          total: this.totalTests,
          passed: this.passedTests,
          failed: this.totalTests - this.passedTests,
          successRate: this.totalTests > 0 ? (this.passedTests / this.totalTests) * 100 : 0
        },
        results: this.results
      }, null, 2));

      console.log(`\n💾 Results saved to: ${resultsFile}`);
    } catch (err) {
      console.log(`\n⚠️  Could not save results: ${err.message}`);
    }
    
    console.log('\n🎉 REPL testing complete!');
  }
}

// Run the tests if this script is called directly
if (require.main === module) {
  const tester = new SimpleREPLTester();
  tester.runAllTests().catch(err => {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  });
}

module.exports = SimpleREPLTester;