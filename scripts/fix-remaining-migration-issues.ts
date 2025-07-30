#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function fixFile(filePath: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;
    const originalContent = content;

    // Fix 1: Extra closing parenthesis issue
    // expect(result.program)).toBeTruthy() -> expect(result.program).toBeTruthy()
    const extraParenPattern = /expect\(([^)]+)\)\)\.toBeTruthy\(\)/g;
    content = content.replace(extraParenPattern, 'expect($1).toBeTruthy()');
    if (content !== originalContent) {
      changed = true;
      console.log(`  ✓ Fixed extra parenthesis in ${filePath}`);
    }

    // Fix 2: assert.unreachable calls
    // assert.unreachable('message') -> expect.unreachable('message') or throw new Error('message')
    const unreachablePattern = /assert\.unreachable\(([^)]+)\)/g;
    content = content.replace(unreachablePattern, 'throw new Error($1)');
    if (content !== originalContent) {
      changed = true;
      console.log(`  ✓ Fixed assert.unreachable in ${filePath}`);
    }

    // Fix 3: assert.match calls
    // assert.match(value, regex) -> expect(value).toMatch(regex)
    const matchPattern = /assert\.match\(([^,]+),\s*([^)]+)\)/g;
    content = content.replace(matchPattern, 'expect($1).toMatch($2)');
    if (content !== originalContent) {
      changed = true;
      console.log(`  ✓ Fixed assert.match in ${filePath}`);
    }

    // Fix 4: Remaining broken throws patterns
    // expect(().not.toThrow() => ...) -> expect(() => ...).not.toThrow()
    const brokenNotThrowsPattern = /expect\(\(\)\.not\.toThrow\(\)\s*=>\s*([^)]+(?:\([^)]*\))*[^)]*)\)/g;
    content = content.replace(brokenNotThrowsPattern, 'expect(() => $1).not.toThrow()');
    if (content !== originalContent) {
      changed = true;
      console.log(`  ✓ Fixed broken not.toThrow() in ${filePath}`);
    }

    // Fix 5: Any remaining invalid import syntax
    // Check for malformed import statements
    const importPattern = /import\s*{\s*([^}]*)\s*}\s*from\s*['"]([^'"]*)['"]/g;
    let importMatch;
    while ((importMatch = importPattern.exec(content)) !== null) {
      const imports = importMatch[1];
      const module = importMatch[2];
      
      // Check if this is a malformed bun:test import
      if (module === 'bun:test' && !imports.includes('describe') && !imports.includes('test') && !imports.includes('expect')) {
        // This might be a malformed import, fix it
        const fixedImport = "import { describe, test, expect } from 'bun:test';";
        content = content.replace(importMatch[0], fixedImport);
        changed = true;
        console.log(`  ✓ Fixed malformed import in ${filePath}`);
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
  console.log('🔧 Fixing remaining migration issues...');
  
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
  
  console.log(`\n✅ Fixed remaining issues in ${fixedCount} files`);
}

if (require.main === module) {
  main();
}