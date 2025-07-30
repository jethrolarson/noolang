#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function fixFile(filePath: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;

    // Fix the specific broken pattern:
    // expect(typeToString(result.type).toBe(result.state.substitution), 'Expected')
    // Should be: expect(typeToString(result.type, result.state.substitution)).toBe('Expected')
    const brokenPattern = /expect\(typeToString\(([^)]+)\)\.toBe\(([^)]+)\),\s*(['"][^'"]*['"])\)/g;
    
    let match;
    while ((match = brokenPattern.exec(content)) !== null) {
      const typeExpr = match[1];
      const substitution = match[2];
      const expectedValue = match[3];
      
      const fixed = `expect(typeToString(${typeExpr}, ${substitution})).toBe(${expectedValue})`;
      content = content.replace(match[0], fixed);
      changed = true;
      console.log(`  ✓ Fixed complex assertion in ${filePath}`);
    }

    // Reset regex lastIndex to ensure all matches are found
    brokenPattern.lastIndex = 0;

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
  console.log('🔧 Fixing complex assertion patterns...');
  
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
  
  console.log(`\n✅ Fixed complex assertions in ${fixedCount} files`);
}

if (require.main === module) {
  main();
}