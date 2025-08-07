#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Find all noolang code blocks in markdown files
function extractCodeBlocks(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const blocks = [];
    const lines = content.split('\n');
    
    let inCodeBlock = false;
    let currentBlock = [];
    let blockStart = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.trim() === '```noolang') {
            inCodeBlock = true;
            blockStart = i + 1;
            currentBlock = [];
        } else if (line.trim() === '```' && inCodeBlock) {
            inCodeBlock = false;
            blocks.push({
                code: currentBlock.join('\n'),
                startLine: blockStart,
                filePath
            });
        } else if (inCodeBlock) {
            currentBlock.push(line);
        }
    }
    
    return blocks;
}

// Test a code block
function testCodeBlock(block, index) {
    const testFile = `test_auto_${index}.noo`;
    
    try {
        fs.writeFileSync(testFile, block.code);
        execSync(`bun start ${testFile}`, { stdio: 'pipe' });
        fs.unlinkSync(testFile);
        return { success: true };
    } catch (error) {
        fs.unlinkSync(testFile);
        return { 
            success: false, 
            error: error.message,
            code: block.code
        };
    }
}

// Main execution
const docsDir = './docs';
const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(docsDir, f));

console.log('🔍 Validating all Noolang examples...\n');

let totalBlocks = 0;
let failedBlocks = 0;

for (const file of files) {
    console.log(`📄 ${file}`);
    const blocks = extractCodeBlocks(file);
    
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        totalBlocks++;
        
        const result = testCodeBlock(block, totalBlocks);
        
        if (result.success) {
            console.log(`  ✅ Block ${i + 1} (line ${block.startLine}): PASS`);
        } else {
            failedBlocks++;
            console.log(`  ❌ Block ${i + 1} (line ${block.startLine}): FAIL`);
            console.log(`     Error: ${result.error.split('\n')[0]}`);
            console.log(`     Code: ${result.code.split('\n')[0]}...`);

        }
    }
    console.log();
}

console.log(`📊 Summary: ${totalBlocks - failedBlocks}/${totalBlocks} examples pass`);
if (failedBlocks > 0) {
    console.log(`⚠️  ${failedBlocks} examples need fixing`);
    process.exit(1);
}

console.log("Okay chatbot. Now add this to ci.yml or something so it runs automatically")