#!/usr/bin/env ts-node

import { readFileSync, writeFileSync } from 'fs';

const filesToFix = [
  'src/typer/__tests__/trait-system.test.ts',
  'src/typer/__tests__/trait-system-resolution.test.ts'
];

function fixFile(filePath: string): boolean {
  let content = readFileSync(filePath, 'utf-8');
  let changed = false;
  
  // Fix assert.not.match calls
  const originalContent = content;
  content = content.replace(/assert\.not\.match\(([^,]+),\s*([^)]+)\)/g, 'expect($1).not.toMatch($2)');
  
  if (content !== originalContent) {
    changed = true;
  }
  
  if (changed) {
    writeFileSync(filePath, content);
    return true;
  }
  return false;
}

for (const filePath of filesToFix) {
  console.log(`Fixing ${filePath}...`);
  
  const success = fixFile(filePath);
  
  if (success) {
    console.log(`✅ Fixed ${filePath}`);
  } else {
    console.log(`⏭️ No changes needed in ${filePath}`);
  }
}

console.log('✅ All remaining assert calls fixed!');