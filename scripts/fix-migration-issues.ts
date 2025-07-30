#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Fix common migration issues
function fixFile(filePath: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;

    // Fix broken throws syntax: expect(().toThrow() => ...) -> expect(() => ...).toThrow()
    const throwsMatches = content.match(/expect\(\(\)\.toThrow\(\)\s*=>\s*([^)]+(?:\([^)]*\))*[^)]*)\)/g);
    if (throwsMatches) {
      for (const match of throwsMatches) {
        const lambdaBody = match.match(/=>\s*(.+)\)/)?.[1];
        if (lambdaBody) {
          const fixed = `expect(() => ${lambdaBody}).toThrow()`;
          content = content.replace(match, fixed);
          changed = true;
          console.log(`  ✓ Fixed throws syntax in ${filePath}`);
        }
      }
    }

    // Fix chained toBeTruthy issues: something.toBeTruthy() -> expect(something).toBeTruthy()
    const chainedMatches = content.match(/(\w+(?:\.\w+)*\([^)]*\))\.toBeTruthy\(\)/g);
    if (chainedMatches) {
      for (const match of chainedMatches) {
        const expression = match.replace('.toBeTruthy()', '');
        const fixed = `expect(${expression}).toBeTruthy()`;
        content = content.replace(match, fixed);
        changed = true;
        console.log(`  ✓ Fixed chained toBeTruthy in ${filePath}`);
      }
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
  console.log('🔧 Fixing migration issues...');
  
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
  
  console.log(`\n✅ Fixed issues in ${fixedCount} files`);
}

if (require.main === module) {
  main();
}