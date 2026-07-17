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

// Extract fenced ```noolang code blocks with their starting line numbers.
function extractNoolangBlocks(filePath) {
	const lines = fs.readFileSync(filePath, 'utf8').split('\n');
	const blocks = [];
	let inBlock = false;
	let start = 0;
	let buf = [];
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t === '```noolang') {
			inBlock = true;
			start = i + 1;
			buf = [];
		} else if (t === '```' && inBlock) {
			inBlock = false;
			if (buf.join('').trim()) blocks.push({ startLine: start + 1, code: buf.join('\n') });
		} else if (inBlock) {
			buf.push(lines[i]);
		}
	}
	return blocks;
}

// Validate each ```noolang block independently. Used for README.md, which is a
// collection of standalone illustrative snippets rather than one program, so it
// must not be validated as a single concatenated program (see issue #102).
function runMarkdownPerBlock(filePath) {
	const blocks = extractNoolangBlocks(filePath);
	// Materialize blocks inside the repo: imports resolve relative to the
	// block file, and bare specifiers need the repo's noolang.json in scope
	const tmp = fs.mkdtempSync(path.join('.', '.noolang-blocks-'));
	const failures = [];
	for (const block of blocks) {
		const f = path.join(tmp, 'block.noo');
		fs.writeFileSync(f, block.code);
		try {
			execSync(`bun start ${f}`, { stdio: 'pipe' });
		} catch (error) {
			const stdout = error.stdout ? error.stdout.toString() : '';
			const stderr = error.stderr ? error.stderr.toString() : '';
			failures.push({ startLine: block.startLine, output: (stdout + stderr).trim() });
		}
	}
	fs.rmSync(tmp, { recursive: true, force: true });
	return { total: blocks.length, failures };
}

// Main execution
const docsDir = './docs';
// docs/*.md are tutorial-style and validated as whole (concatenated) programs.
const wholeFileDocs = fs
	.readdirSync(docsDir)
	.filter(f => f.endsWith('.md'))
	.map(f => path.join(docsDir, f));

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

// README.md is a collection of standalone snippets, so each ```noolang block is
// validated independently rather than as one concatenated program (issue #102).
console.log('📄 README.md (per-block)');
const readme = runMarkdownPerBlock('README.md');
if (readme.failures.length === 0) {
	console.log(`  ✅ PASS (${readme.total} blocks)`);
} else {
	failed = true;
	console.log(
		`  ❌ FAIL (${readme.failures.length}/${readme.total} blocks failed)`
	);
	for (const f of readme.failures) {
		const firstError =
			(f.output.match(/(TypeError|Parse error|Error)[^\n]*/) || [
				'(runtime/other error)',
			])[0];
		console.log(`  ── block at README.md line ${f.startLine}: ${firstError}`);
	}
}
console.log();

if (failed) {
	process.exit(1);
}
console.log('📊 All documentation examples passed validation!');