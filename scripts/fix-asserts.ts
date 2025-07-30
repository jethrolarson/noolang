#!/usr/bin/env ts-node

import { readFileSync, writeFileSync } from 'fs';

function fixAssertNotMatch(content: string): string {
  return content.replace(/assert\.not\.match\(([^,]+),\s*([^)]+)\)/g, 'expect($1).not.toMatch($2)');
}

const files = [
  'src/typer/__tests__/trait-system.test.ts',
  'src/typer/__tests__/trait-system-resolution.test.ts'
];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const fixed = fixAssertNotMatch(content);
  
  if (content !== fixed) {
    writeFileSync(file, fixed);
    console.log(`✅ Fixed ${file}`);
  } else {
    console.log(`⏭️ No changes needed in ${file}`);
  }
}

console.log('Done!');
