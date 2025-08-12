#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Transform markdown to literate Noolang program using ; as expression sequencer
function transformMarkdownToNoolang(filePath) {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');
	const noolangLines = [];

	let inCodeBlock = false;
	let codeBlockContent = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.trim() === '```noolang') {
			inCodeBlock = true;
			codeBlockContent = [];
		} else if (line.trim() === '```' && inCodeBlock) {
			inCodeBlock = false;
			// Add the code block content
			noolangLines.push(...codeBlockContent);
			noolangLines.push(''); // Empty line for separation
		} else if (inCodeBlock) {
			codeBlockContent.push(line);
		}
		// Skip all non-code lines
	}

	// Ensure we end with a proper expression if the file ends with code
	if (inCodeBlock && codeBlockContent.length > 0) {
		noolangLines.push(...codeBlockContent);
	}

	// Now post-process to create a valid Noolang program using ; as expression sequencer
	const processedLines = [];

	// Start with a comment explaining this is a literate program
	processedLines.push('# Literate Noolang program generated from markdown');
	processedLines.push(
		'# All examples are combined into one program using ; as expression sequencer'
	);
	processedLines.push('');

	// Process each line and build a sequence of expressions
	let expressions = [];

	for (let i = 0; i < noolangLines.length; i++) {
		const line = noolangLines[i];

		if (line.trim() === '') {
			continue; // Skip empty lines
		} else if (line.trim().startsWith('#')) {
			// Comments are fine as-is
			processedLines.push(line);
		} else if (line.trim()) {
			// This is code, collect it for sequencing
			// Remove trailing semicolon if present, we'll add it back in the sequence
			let cleanLine = line.trim();
			if (cleanLine.endsWith(';')) {
				cleanLine = cleanLine.slice(0, -1).trim();
			}
			if (cleanLine) {
				expressions.push(cleanLine);
			}
		}
	}

	// Now create the sequenced expression
	if (expressions.length > 0) {
		// Join all expressions with ; to create a sequence
		const sequencedExpression = expressions.join(' ; ');
		processedLines.push('');
		processedLines.push('# Sequenced expressions:');
		processedLines.push(sequencedExpression);
	}

	return processedLines.join('\n');
}

// Test the transformed program
function testLiterateProgram(content, sourceFile) {
	const testFile = `test_literate_${path.basename(sourceFile, '.md')}.noo`;

	try {
		fs.writeFileSync(testFile, content);
		execSync(`bun start ${testFile}`, { stdio: 'pipe' });
		fs.unlinkSync(testFile);
		return { success: true };
	} catch (error) {
		// Don't delete the test file so we can inspect it
		return {
			success: false,
			error: error.message,
			sourceFile,
			testFile,
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

console.log('🔍 Validating Noolang examples as literate programs...\n');

let totalFiles = 0;
let failedFiles = 0;

for (const file of files) {
	console.log(`📄 ${file}`);
	totalFiles++;

	try {
		const noolangProgram = transformMarkdownToNoolang(file);
		const result = testLiterateProgram(noolangProgram, file);

		if (result.success) {
			console.log(`  ✅ PASS - Generated valid Noolang program`);
		} else {
			failedFiles++;
			console.log(`  ❌ FAIL - ${result.error}`);
			console.log(`  Test file saved as: ${result.testFile}`);
		}
	} catch (error) {
		failedFiles++;
		console.log(`  ❌ ERROR - ${error.message}`);
	}
	console.log();
}

console.log(
	`📊 Summary: ${totalFiles - failedFiles}/${totalFiles} files generate valid programs`
);
if (failedFiles > 0) {
	process.exit(1);
}