#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Run a markdown file directly using CLI's literate mode
function runMarkdown(filePath) {
	try {
		// Run without a pipe so non-zero exits propagate correctly
		execSync(`bun start ${filePath}`, { stdio: 'pipe' });
		return { success: true };
	} catch (error) {
		// Collect as much context as possible from bun/CLI
		const stdout = error.stdout ? error.stdout.toString() : '';
		const stderr = error.stderr ? error.stderr.toString() : '';
		const message = error.message || '';
		return {
			success: false,
			error: message,
			stdout,
			stderr,
		};
	}
}

// Main execution
const docsDir = './docs';
const files = fs
	.readdirSync(docsDir)
	.filter(f => f.endsWith('.md'))
	.map(f => path.join(docsDir, f))
	.concat(['README.md']);

console.log(
	'🔍 Validating Noolang markdown files using native literate mode...\n'
);

let totalFiles = 0;
let failedFiles = 0;

for (const file of files) {
	console.log(`📄 ${file}`);
	totalFiles++;

	try {
		const result = runMarkdown(file);

		if (result.success) {
			console.log(`  ✅ PASS`);
		} else {
			failedFiles++;
			console.log(`  ❌ FAIL`);
			if (result.stdout && result.stdout.trim().length > 0) {
				console.log('  ── stdout:');
				console.log(result.stdout.trim());
			}
			if (result.stderr && result.stderr.trim().length > 0) {
				console.log('  ── stderr:');
				console.log(result.stderr.trim());
			}
			if (result.error) {
				console.log('  ── error:');
				console.log(result.error);
			}
		}
	} catch (error) {
		failedFiles++;
		console.log(`  ❌ ERROR - ${error.message}`);
	}
	console.log();
}

console.log(
	`📊 Summary: ${totalFiles - failedFiles}/${totalFiles} files executed successfully`
);
if (failedFiles > 0) {
	process.exit(1);
}