#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Benchmark configuration
const WARMUP_RUNS = 3;
const MEASUREMENT_RUNS = 5;
const BENCHMARKS = [
  { name: 'simple', file: 'benchmarks/simple.noo', description: 'Basic language features' },
  { name: 'medium', file: 'benchmarks/medium.noo', description: 'Complex types and pattern matching' },
  { name: 'complex', file: 'benchmarks/complex.noo', description: 'Heavy type inference and constraints' }
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

function runBenchmark(benchmarkFile) {
  const start = process.hrtime.bigint();
  
  try {
    execSync(`npm run start -- ${benchmarkFile}`, { 
      stdio: 'pipe',
      timeout: 30000 // 30 second timeout
    });
    
    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // Convert to milliseconds
  } catch (error) {
    throw new Error(`Benchmark failed: ${error.message}`);
  }
}

function measureBenchmark(benchmark) {
  log(colors.header, `\n📊 Running benchmark: ${benchmark.name}`);
  console.log(`   ${benchmark.description}`);
  console.log(`   File: ${benchmark.file}`);
  
  // Check if file exists
  if (!fs.existsSync(benchmark.file)) {
    log(colors.error, `   ❌ Benchmark file not found: ${benchmark.file}`);
    return null;
  }
  
  try {
    // Warmup runs
    console.log(`   🔥 Warming up (${WARMUP_RUNS} runs)...`);
    for (let i = 0; i < WARMUP_RUNS; i++) {
      runBenchmark(benchmark.file);
    }
    
    // Measurement runs
    console.log(`   ⏱️  Measuring (${MEASUREMENT_RUNS} runs)...`);
    const times = [];
    for (let i = 0; i < MEASUREMENT_RUNS; i++) {
      const time = runBenchmark(benchmark.file);
      times.push(time);
    }
    
    // Calculate statistics
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
    
    const result = {
      benchmark: benchmark.name,
      min: min.toFixed(1),
      max: max.toFixed(1),
      avg: avg.toFixed(1),
      median: median.toFixed(1),
      runs: times.map(t => t.toFixed(1))
    };
    
    log(colors.success, `   ✅ Results:`);
    console.log(`      Min:    ${result.min}ms`);
    console.log(`      Max:    ${result.max}ms`);
    console.log(`      Avg:    ${result.avg}ms`);
    console.log(`      Median: ${result.median}ms`);
    
    return result;
    
  } catch (error) {
    log(colors.error, `   ❌ ${error.message}`);
    return null;
  }
}

function saveBenchmarkResults(results) {
  const timestamp = new Date().toISOString();
  const resultsDir = 'benchmark-results';
  
  // Create results directory if it doesn't exist
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
  }
  
  const filename = path.join(resultsDir, `results-${timestamp.split('T')[0]}.json`);
  
  const data = {
    timestamp,
    git_commit: getGitCommit(),
    results: results.filter(r => r !== null)
  };
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  log(colors.success, `\n💾 Results saved to: ${filename}`);
}

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function printSummary(results) {
  const validResults = results.filter(r => r !== null);
  if (validResults.length === 0) {
    log(colors.error, '\n❌ No successful benchmarks');
    return;
  }
  
  log(colors.header, '\n📈 Benchmark Summary');
  console.log('┌─────────────┬─────────┬─────────┬─────────┬─────────┐');
  console.log('│ Benchmark   │ Min     │ Max     │ Avg     │ Median  │');
  console.log('├─────────────┼─────────┼─────────┼─────────┼─────────┤');
  
  for (const result of validResults) {
    const name = result.benchmark.padEnd(11);
    const min = (result.min + 'ms').padStart(7);
    const max = (result.max + 'ms').padStart(7);
    const avg = (result.avg + 'ms').padStart(7);
    const median = (result.median + 'ms').padStart(7);
    
    console.log(`│ ${name} │ ${min} │ ${max} │ ${avg} │ ${median} │`);
  }
  
  console.log('└─────────────┴─────────┴─────────┴─────────┴─────────┘');
}

// Main execution
async function main() {
  log(colors.header, '🚀 Noolang Performance Benchmarks');
  console.log(`Warmup runs: ${WARMUP_RUNS}, Measurement runs: ${MEASUREMENT_RUNS}`);
  
  const results = [];
  
  for (const benchmark of BENCHMARKS) {
    const result = measureBenchmark(benchmark);
    results.push(result);
  }
  
  printSummary(results);
  saveBenchmarkResults(results);
  
  log(colors.success, '\n🎉 Benchmarking complete!');
}

if (require.main === module) {
  main().catch(error => {
    log(colors.error, `\n💥 Benchmark runner failed: ${error.message}`);
    process.exit(1);
  });
}