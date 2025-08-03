#!/usr/bin/env ts-node

import { readFileSync, writeFileSync } from 'fs';

const filesToFix = [
  'src/repl/__tests__/repl.test.ts',
  'test/features/effects/effects_phase3.test.ts'
];

function fixAsserts(content: string): string {
  let fixed = content;
  
  // Fix assert.is calls
  fixed = fixed.replace(/assert\.is\(([^,]+),\s*([^,)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toBe($2)');
  
  // Fix assert.equal calls  
  fixed = fixed.replace(/assert\.equal\(([^,]+),\s*([^,)]+)(?:,\s*[^)]+)?\)/g, 'expect($1).toEqual($2)');
  
  return fixed;
}

for (const filePath of filesToFix) {
  console.log(`Fixing ${filePath}...`);
  
  const content = readFileSync(filePath, 'utf-8');
  const fixed = fixAsserts(content);
  
  if (content !== fixed) {
    writeFileSync(filePath, fixed);
    console.log(`✅ Fixed ${filePath}`);
  } else {
    console.log(`⏭️ No changes needed in ${filePath}`);
  }
}

console.log('✅ All assert calls fixed!');