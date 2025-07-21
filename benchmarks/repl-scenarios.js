#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// REPL Benchmark Scenarios
const REPL_SCENARIOS = [
  {
    name: 'interactive-basic',
    description: 'Basic REPL interactions',
    inputs: [
      '1 + 2',
      'let x = 10',
      'x * 2',
      '"hello" ++ " world"',
      '[1, 2, 3] |> map(\\n -> n * 2)'
    ]
  },
  {
    name: 'interactive-complex',
    description: 'Complex REPL type inference',
    inputs: [
      'let factorial = \\n -> if n <= 1 then 1 else n * factorial(n - 1)',
      'factorial(5)',
      'let compose = \\f g x -> f(g(x))',
      'let double = \\x -> x * 2',
      'let increment = \\x -> x + 1',
      'compose(double, increment)(5)'
    ]
  },
  {
    name: 'interactive-state',
    description: 'State persistence across REPL sessions',
    inputs: [
      'let users = [{name: "Alice", age: 30}, {name: "Bob", age: 25}]',
      'let getNames = \\users -> users |> map(\\u -> u.name)',
      'getNames(users)',
      'let addUser = \\user users -> users ++ [user]',
      'let newUsers = addUser({name: "Charlie", age: 35}, users)',
      'getNames(newUsers)'
    ]
  }
];

// Colors for output
const colors = {
  header: '\x1b[36m',  // cyan
  success: '\x1b[32m', // green
  warning: '\x1b[33m', // yellow
  error: '\x1b[31m',   // red
  reset: '\x1b[0m'     // reset
};

function log(color, message) {
  console.log(color + message + colors.reset);
}

class REPLBenchmark {
  constructor() {
    this.process = null;
    this.results = [];
  }

  async startREPL() {
    return new Promise((resolve, reject) => {
      this.process = spawn('npx', ['ts-node', 'src/repl.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let output = '';
      let isReady = false;

      this.process.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('noo>') && !isReady) {
          isReady = true;
          resolve();
        }
      });

      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        if (!isReady) {
          reject(new Error(`REPL startup failed: ${error}`));
        }
      });

      setTimeout(() => {
        if (!isReady) {
          reject(new Error('REPL startup timeout'));
        }
      }, 10000);
    });
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const start = process.hrtime.bigint();
      let output = '';
      let responseReceived = false;

      const onData = (data) => {
        output += data.toString();
        if (output.includes('noo>')) {
          if (!responseReceived) {
            responseReceived = true;
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
            this.process.stdout.removeListener('data', onData);
            resolve({ duration, output });
          }
        }
      };

      this.process.stdout.on('data', onData);

      // Send command
      this.process.stdin.write(command + '\n');

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!responseReceived) {
          this.process.stdout.removeListener('data', onData);
          reject(new Error(`Command timeout: ${command}`));
        }
      }, 5000);
    });
  }

  async benchmarkScenario(scenario) {
    log(colors.header, `\n📊 REPL Benchmark: ${scenario.name}`);
    console.log(`   ${scenario.description}`);

    try {
      await this.startREPL();
      
      const measurements = [];
      let totalTime = 0;

      for (const input of scenario.inputs) {
        console.log(`   Executing: ${input.substring(0, 50)}${input.length > 50 ? '...' : ''}`);
        
        const result = await this.executeCommand(input);
        measurements.push({
          input,
          duration: result.duration,
          output: result.output.split('noo>')[0].trim()
        });
        totalTime += result.duration;
      }

      // Calculate statistics
      const durations = measurements.map(m => m.duration);
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const median = durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)];

      const result = {
        scenario: scenario.name,
        totalTime: totalTime.toFixed(1),
        commandCount: scenario.inputs.length,
        min: min.toFixed(1),
        max: max.toFixed(1),
        avg: avg.toFixed(1),
        median: median.toFixed(1),
        measurements
      };

      log(colors.success, `   ✅ Scenario completed:`);
      console.log(`      Commands:   ${result.commandCount}`);
      console.log(`      Total Time: ${result.totalTime}ms`);
      console.log(`      Avg/Cmd:    ${result.avg}ms`);
      console.log(`      Min:        ${result.min}ms`);
      console.log(`      Max:        ${result.max}ms`);
      console.log(`      Median:     ${result.median}ms`);

      this.results.push(result);
      return result;

    } catch (error) {
      log(colors.error, `   ❌ Scenario failed: ${error.message}`);
      return null;
    } finally {
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
    }
  }

  async runAll() {
    log(colors.header, '🚀 REPL Performance Benchmarks');
    console.log(`Scenarios: ${REPL_SCENARIOS.length}`);

    const results = [];
    
    for (const scenario of REPL_SCENARIOS) {
      const result = await this.benchmarkScenario(scenario);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  printSummary(results) {
    if (results.length === 0) {
      log(colors.error, '\n❌ No successful REPL benchmarks');
      return;
    }

    log(colors.header, '\n📈 REPL Benchmark Summary');
    console.log('┌─────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Scenario            │ Commands │ Total    │ Avg/Cmd  │ Min      │ Max      │');
    console.log('├─────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

    for (const result of results) {
      const name = result.scenario.padEnd(19);
      const commands = result.commandCount.toString().padStart(8);
      const total = (result.totalTime + 'ms').padStart(8);
      const avg = (result.avg + 'ms').padStart(8);
      const min = (result.min + 'ms').padStart(8);
      const max = (result.max + 'ms').padStart(8);

      console.log(`│ ${name} │ ${commands} │ ${total} │ ${avg} │ ${min} │ ${max} │`);
    }

    console.log('└─────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
  }

  saveBenchmarkResults(results) {
    const timestamp = new Date().toISOString();
    const resultsDir = 'benchmark-results';

    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }

    const filename = path.join(resultsDir, `repl-results-${timestamp.split('T')[0]}.json`);

    const data = {
      timestamp,
      type: 'repl-benchmarks',
      git_commit: this.getGitCommit(),
      results
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    log(colors.success, `\n💾 REPL results saved to: ${filename}`);
  }

  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

async function main() {
  const benchmark = new REPLBenchmark();
  
  try {
    const results = await benchmark.runAll();
    benchmark.printSummary(results);
    benchmark.saveBenchmarkResults(results);
    log(colors.success, '\n🎉 REPL benchmarking complete!');
  } catch (error) {
    log(colors.error, `\n💥 REPL benchmark failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { REPLBenchmark, REPL_SCENARIOS };