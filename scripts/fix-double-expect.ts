#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function fixFile(filePath: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;

    // Fix double expect pattern: expect(expect(something).toBeTruthy()); -> expect(something).toBeTruthy();
    const doubleExpectPattern = /expect\(expect\(([^)]+(?:\([^)]*\))*[^)]*)\)\.toBeTruthy\(\)\);/g;
    const matches = content.match(doubleExpectPattern);
    if (matches) {
      content = content.replace(doubleExpectPattern, 'expect($1).toBeTruthy();');
      changed = true;
      console.log(`  ✓ Fixed ${matches.length} double expect patterns in ${filePath}`);
    }

    // Fix more complex double expect patterns with message parameters
    const doubleExpectWithMessagePattern = /expect\(expect\(([^,)]+(?:\([^)]*\))*[^,)]*),\s*([^)]+)\)\.toBeTruthy\(\)\);/g;
    const messageMatches = content.match(doubleExpectWithMessagePattern);
    if (messageMatches) {
      content = content.replace(doubleExpectWithMessagePattern, 'expect($1).toBeTruthy();');
      changed = true;
      console.log(`  ✓ Fixed ${messageMatches.length} double expect with message patterns in ${filePath}`);
    }

    // Fix remaining malformed throws: expect(().toThrow() => anything) -> expect(() => anything).toThrow()
    const stillBrokenThrows = /expect\(\(\)\.toThrow\(\)\s*=>\s*([^)]+(?:\([^)]*\))*[^)]*)\);?/g;
    const throwsMatches = content.match(stillBrokenThrows);
    if (throwsMatches) {
      content = content.replace(stillBrokenThrows, 'expect(() => $1).toThrow();');
      changed = true;
      console.log(`  ✓ Fixed ${throwsMatches.length} malformed throws in ${filePath}`);
    }

    if (changed) {
      writeFileSync(filePath, content);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error fixing ${filePath}: ${error}`);
    return false;
  }
}

function findTestFiles(dir: string): string[] {
  const testFiles: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        testFiles.push(...findTestFiles(fullPath));
      } else if (item.endsWith('.test.ts')) {
        testFiles.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}: ${error}`);
  }
  
  return testFiles;
}

function main() {
  console.log('🔧 Fixing double expect patterns...');
  
  const allTestFiles = [
    ...findTestFiles('test/'),
    ...findTestFiles('src/')
  ];
  
  let fixedCount = 0;
  
  for (const file of allTestFiles) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Fixed double expect patterns in ${fixedCount} files`);
}

if (require.main === module) {
  main();
}