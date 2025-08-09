#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Load compiled modules for type-only measurement
let Lexer, parse, typeAndDecorate;
try {
  ({ Lexer } = require('./dist/lexer/lexer.js'));
  ({ parse } = require('./dist/parser/parser.js'));
  ({ typeAndDecorate } = require('./dist/typer/index.js'));
} catch (e) {
  console.error('Type benchmark requires a build. Please run: bun run build');
  process.exit(1);
}

const WARMUP_RUNS = 3;
const MEASUREMENT_RUNS = 5;

const TYPE_THRESHOLDS = {
  simple: { max: 80, warning: 60 },
  medium: { max: 80, warning: 60 },
  complex: { max: 80, warning: 60 },
};

const FILE_BENCHMARKS = [
  { name: 'simple', file: 'benchmarks/simple.noo', description: 'Basic language typing' },
  { name: 'medium', file: 'benchmarks/medium.noo', description: 'Collections and constraints' },
  { name: 'complex', file: 'benchmarks/complex.noo', description: 'Heavy type inference and constraints' },
];

const MICRO_BENCHMARKS = [
  {
    name: 'micro_tuples_records',
    code: `
      buildPair = fn x y => { @0 x, @1 y };
      pair = buildPair 10 20;
      triple = { @0 1, @1 2, @2 3 };
      pick0 = fn t => @0 t;
      pick1 = fn t => @1 t;
      pick2 = fn t => @2 t;
      pick0 triple;
    `,
    description: 'Tuple/record construction and access typing',
    thresholds: { max: 60, warning: 40 },
  },
  {
    name: 'micro_constraints_map',
    code: `
      nums = [1, 2, 3, 4, 5];
      inc = fn x => x + 1;
      map inc nums;
    `,
    description: 'Trait constraint resolution (map) typing',
    thresholds: { max: 70, warning: 50 },
  },
  {
    name: 'micro_nested_functions',
    code: `
      f = fn a b c => a + b + c;
      g = fn x => f x 2 3;
      h = fn y => g (y * 2);
      h 10;
    `,
    description: 'Nested function typing',
    thresholds: { max: 50, warning: 35 },
  },
];

function typeOnceFromString(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  const start = performance.now();
  typeAndDecorate(program);
  const end = performance.now();
  return end - start;
}

function typeOnceFromFile(filePath) {
  const fullPath = path.resolve(filePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  return typeOnceFromString(code);
}

function runSuite(entry) {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    if (entry.file) typeOnceFromFile(entry.file);
    else typeOnceFromString(entry.code);
  }
  // Measurement
  const times = [];
  for (let i = 0; i < MEASUREMENT_RUNS; i++) {
    const ms = entry.file ? typeOnceFromFile(entry.file) : typeOnceFromString(entry.code);
    times.push(ms);
  }
  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const median = times[Math.floor(times.length / 2)];
  return { min, max, avg, median, runs: times };
}

function summarize(name, stats, thresholds) {
  const res = {
    benchmark: name,
    phase: 'type',
    min: stats.min.toFixed(1),
    max: stats.max.toFixed(1),
    avg: stats.avg.toFixed(1),
    median: stats.median.toFixed(1),
    runs: stats.runs.map(t => t.toFixed(1)),
  };
  if (thresholds) {
    const a = stats.avg;
    if (a > thresholds.max) res.status = 'failed';
    else if (a > thresholds.warning) res.status = 'warning';
    else res.status = 'passed';
  }
  return res;
}

function printSummary(results) {
  console.log('\x1b[36m\n📈 Type Benchmark Summary\x1b[0m');
  console.log('┌─────────────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐');
  console.log('│ Benchmark               │ Phase   │ Min     │ Max     │ Avg     │ Median  │');
  console.log('├─────────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤');
  for (const r of results) {
    const name = r.benchmark.padEnd(23);
    const phase = r.phase.padEnd(7);
    const min = (r.min + 'ms').padStart(7);
    const max = (r.max + 'ms').padStart(7);
    const avg = (r.avg + 'ms').padStart(7);
    const median = (r.median + 'ms').padStart(7);
    console.log(`│ ${name} │ ${phase} │ ${min} │ ${max} │ ${avg} │ ${median} │`);
  }
  console.log('└─────────────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘');
}

function saveResults(results) {
  const timestamp = new Date().toISOString();
  const resultsDir = 'benchmark-results';
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const filename = path.join(
    resultsDir,
    `type-results-${timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)}.json`
  );
  const data = {
    timestamp,
    type_benchmarks: results,
  };
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`\x1b[32m\n💾 Type results saved to: ${filename}\x1b[0m`);
}

function main() {
  console.log('\x1b[36m🚀 Noolang Type Benchmarks\x1b[0m');
  console.log(`Warmup runs: ${WARMUP_RUNS}, Measurement runs: ${MEASUREMENT_RUNS}`);

  const results = [];

  for (const b of FILE_BENCHMARKS) {
    if (!fs.existsSync(b.file)) {
      console.log(`Skipping missing file benchmark: ${b.file}`);
      continue;
    }
    console.log(`\n📄 File: ${b.name} (${b.file})`);
    const stats = runSuite(b);
    const res = summarize(b.name, stats, TYPE_THRESHOLDS[b.name]);
    console.log(`   Min: ${res.min}ms, Max: ${res.max}ms, Avg: ${res.avg}ms, Median: ${res.median}ms`);
    results.push(res);
  }

  for (const m of MICRO_BENCHMARKS) {
    console.log(`\n🧪 Micro: ${m.name}`);
    const stats = runSuite(m);
    const res = summarize(m.name, stats, m.thresholds);
    console.log(`   Min: ${res.min}ms, Max: ${res.max}ms, Avg: ${res.avg}ms, Median: ${res.median}ms`);
    results.push(res);
  }

  printSummary(results);
  saveResults(results);

  const failed = results.filter(r => r.status === 'failed');
  if (failed.length > 0) {
    console.error('\n\x1b[31m❌ Type performance failed thresholds\x1b[0m');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}