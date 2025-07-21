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
		execSync(`node dist/cli.js --benchmark ${benchmarkFile}`, {
			stdio: 'pipe',
			timeout: 30000, // 30 second timeout
		});

		const end = process.hrtime.bigint();
		return Number(end - start) / 1_000_000; // Convert to milliseconds
	} catch (error) {
		throw new Error(`Benchmark failed: ${error.message}`);
	}
}

function runDetailedBenchmark(benchmarkFile) {
	try {
		const output = execSync(`node dist/cli.js --benchmark ${benchmarkFile}`, {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 30000,
		});

		// Parse the performance output - simpler approach
		const lines = output.split('\n');
		let total = 0,
			read = 0,
			lex = 0,
			parse = 0,
			type = 0,
			eval = 0,
			format = 0;

		for (const line of lines) {
			if (line.includes('Performance (') && line.includes('ms total')) {
				const match = line.match(/Performance \(([\d.]+)ms total/);
				if (match) total = parseFloat(match[1]);
			} else if (line.includes('Read:')) {
				const match = line.match(/Read: ([\d.]+)ms/);
				if (match) read = parseFloat(match[1]);
			} else if (line.includes('Lex:')) {
				const match = line.match(/Lex:\s*([\d.]+)ms/);
				if (match) lex = parseFloat(match[1]);
			} else if (line.includes('Parse:')) {
				const match = line.match(/Parse: ([\d.]+)ms/);
				if (match) parse = parseFloat(match[1]);
			} else if (line.includes('Type:')) {
				const match = line.match(/Type:\s*([\d.]+)ms/);
				if (match) type = parseFloat(match[1]);
			} else if (line.includes('Eval:')) {
				const match = line.match(/Eval:\s*([\d.]+)ms/);
				if (match) eval = parseFloat(match[1]);
			} else if (line.includes('Format:')) {
				const match = line.match(/Format: ([\d.]+)ms/);
				if (match) format = parseFloat(match[1]);
			}
		}

		if (total > 0) {
			return { total, read, lex, parse, type, eval, format };
		} else {
			// Fallback to total time if no detailed breakdown
			return { total: 0, eval: 0 };
		}
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

		// Measurement runs with detailed timing
		console.log(`   ⏱️  Measuring (${MEASUREMENT_RUNS} runs)...`);
		const detailedResults = [];
		for (let i = 0; i < MEASUREMENT_RUNS; i++) {
			const result = runDetailedBenchmark(benchmark.file);
			detailedResults.push(result);
		}

		// Calculate statistics for evaluation time (the actual computation)
		const evalTimes = detailedResults.map(r => r.eval).filter(t => t > 0);
		const totalTimes = detailedResults.map(r => r.total);

		if (evalTimes.length === 0) {
			// Fallback to total time if no eval breakdown
			const min = Math.min(...totalTimes);
			const max = Math.max(...totalTimes);
			const avg = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length;
			const median = totalTimes.sort((a, b) => a - b)[
				Math.floor(totalTimes.length / 2)
			];

			const result = {
				benchmark: benchmark.name,
				min: min.toFixed(1),
				max: max.toFixed(1),
				avg: avg.toFixed(1),
				median: median.toFixed(1),
				runs: totalTimes.map(t => t.toFixed(1)),
				phase: 'total',
			};

			log(
				colors.warning,
				`   ⚠️  Results (total time - includes startup overhead):`
			);
			console.log(`      Min:    ${result.min}ms`);
			console.log(`      Max:    ${result.max}ms`);
			console.log(`      Avg:    ${result.avg}ms`);
			console.log(`      Median: ${result.median}ms`);

			return result;
		} else {
			// Use evaluation time (actual computation)
			const min = Math.min(...evalTimes);
			const max = Math.max(...evalTimes);
			const avg = evalTimes.reduce((a, b) => a + b, 0) / evalTimes.length;
			const median = evalTimes.sort((a, b) => a - b)[
				Math.floor(evalTimes.length / 2)
			];

			const result = {
				benchmark: benchmark.name,
				min: min.toFixed(1),
				max: max.toFixed(1),
				avg: avg.toFixed(1),
				median: median.toFixed(1),
				runs: evalTimes.map(t => t.toFixed(1)),
				phase: 'eval',
			};

			log(
				colors.success,
				`   ✅ Results (evaluation time - actual computation):`
			);
			console.log(`      Min:    ${result.min}ms`);
			console.log(`      Max:    ${result.max}ms`);
			console.log(`      Avg:    ${result.avg}ms`);
			console.log(`      Median: ${result.median}ms`);

			return result;
		}
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

	const filename = path.join(
		resultsDir,
		`results-${timestamp.split('T')[0]}.json`
	);

	const data = {
		timestamp,
		git_commit: getGitCommit(),
		results: results.filter(r => r !== null),
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
	console.log(
		'┌─────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐'
	);
	console.log(
		'│ Benchmark   │ Phase   │ Min     │ Max     │ Avg     │ Median  │'
	);
	console.log(
		'├─────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤'
	);

	for (const result of validResults) {
		const name = result.benchmark.padEnd(11);
		const phase = result.phase.padEnd(7);
		const min = (result.min + 'ms').padStart(7);
		const max = (result.max + 'ms').padStart(7);
		const avg = (result.avg + 'ms').padStart(7);
		const median = (result.median + 'ms').padStart(7);

		console.log(
			`│ ${name} │ ${phase} │ ${min} │ ${max} │ ${avg} │ ${median} │`
		);
	}

	console.log(
		'└─────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘'
	);
}

// Main execution
async function main() {
	const isREPLOnly = process.argv.includes('--repl');
	
	if (isREPLOnly) {
		// Run only REPL benchmarks
		log(colors.header, '🚀 Noolang REPL Performance Benchmarks');
		const { REPLBenchmark } = require('./benchmarks/repl-scenarios.js');
		const replBenchmark = new REPLBenchmark();
		
		try {
			const results = await replBenchmark.runAll();
			replBenchmark.printSummary(results);
			replBenchmark.saveBenchmarkResults(results);
			log(colors.success, '\n🎉 REPL benchmarking complete!');
		} catch (error) {
			log(colors.error, `\n💥 REPL benchmark failed: ${error.message}`);
			process.exit(1);
		}
		return;
	}

	// Standard file-based benchmarks
	log(colors.header, '🚀 Noolang Performance Benchmarks');
	console.log(
		`Warmup runs: ${WARMUP_RUNS}, Measurement runs: ${MEASUREMENT_RUNS}`
	);
	console.log(`Measuring evaluation time (actual computation) when available`);

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