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
// README.md and docs/*.md are all validated as whole (concatenated) literate
// programs today — README.md's own `shadow`/`assert` frontmatter (see
// docs/language-reference.md §Literate Programming) is what makes that safe
// for a doc that redeclares illustrative type names across sections; a
// thrown assertion error from `assert: true` fails this the same way any
// other CLI error does, so no separate assertion-checking step is needed here.
const wholeFileDocs = [
	'README.md',
	...fs
		.readdirSync(docsDir)
		.filter(f => f.endsWith('.md'))
		.map(f => path.join(docsDir, f)),
];

console.log(
	'🔍 Validating Noolang markdown files using native literate mode...\n'
);

let failed = false;

for (const file of wholeFileDocs) {
	console.log(`📄 ${file}`);

	const result = runMarkdown(file);
	if (result.success) {
		console.log(`  ✅ PASS`);
	} else {
		failed = true;
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
	console.log();
}

if (failed) {
	process.exit(1);
}
console.log('📊 All documentation examples passed validation!');
