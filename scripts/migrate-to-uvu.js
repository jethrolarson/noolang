#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const migrateFile = (filePath) => {
  console.log(`\n🔄 Migrating: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Track changes for summary
  const changes = [];
  
  // 1. Add uvu imports at the top (CRITICAL - was missing before)
  if (!content.includes("import { test } from 'uvu'")) {
    // Find the first import or add at the beginning
    const importMatch = content.match(/^(import.*\n)+/m);
    if (importMatch) {
      const firstImportEnd = content.indexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, firstImportEnd) + 
                "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\n" +
                content.slice(firstImportEnd);
    } else {
      content = "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\n" + content;
    }
    changes.push('✓ Added uvu imports');
  }
  
  // 2. Replace Jest imports (if any exist)
  if (content.includes("from '@jest/globals'")) {
    content = content.replace(/import.*from '@jest\/globals'.*;?\n/g, "");
    changes.push('✓ Removed Jest imports');
  }
  
  // 3. Convert describe blocks to comments and flatten structure
  content = content.replace(/describe\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g, '// Test suite: $1');
  if (content !== originalContent) {
    changes.push('✓ Flattened describe blocks');
  }
  
  // 4. Convert nested describes (more complex pattern)
  content = content.replace(/^\s*describe\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/gm, '// Test group: $1');
  
  // 5. Convert it/test calls to uvu test calls
  const itRegex = /(\s*)it\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g;
  content = content.replace(itRegex, "$1test('$2', () => {");
  
  // Also handle 'test(' calls from Jest
  const testRegex = /(\s*)test\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g;
  content = content.replace(testRegex, "$1test('$2', () => {");
  changes.push('✓ Converted it() to test()');
  
  // 6. Convert expect assertions to assert
  const expectReplacements = [
    // expect().toBe() patterns
    { from: /expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, to: 'assert.is($1, $2)', desc: 'toBe → assert.is' },
    
    // expect().toEqual() patterns  
    { from: /expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, to: 'assert.equal($1, $2)', desc: 'toEqual → assert.equal' },
    
    // expect.anything() - remove these as they're Jest-specific
    { from: /expect\.anything\(\)/g, to: 'undefined', desc: 'expect.anything() → undefined' },
    
    // expect().toThrow() patterns
    { from: /expect\(\(\)\s*=>\s*([^)]+)\)\.toThrow\(\)/g, to: 'assert.throws(() => $1)', desc: 'toThrow → assert.throws' },
    { from: /expect\(\(\)\s*=>\s*([^)]+)\)\.toThrow\(['"`]([^'"`]+)['"`]\)/g, to: 'assert.throws(() => $1, $2)', desc: 'toThrow with message → assert.throws' },
    
    // Basic expect().toThrow() without arrow function wrapper
    { from: /expect\(([^)]+)\)\.toThrow\(\)/g, to: 'assert.throws($1)', desc: 'toThrow → assert.throws' },
    { from: /expect\(([^)]+)\)\.toThrow\(['"`]([^'"`]+)['"`]\)/g, to: 'assert.throws($1, $2)', desc: 'toThrow with message → assert.throws' },
    
    // Other common patterns
    { from: /expect\(([^)]+)\)\.toBeNull\(\)/g, to: 'assert.is($1, null)', desc: 'toBeNull → assert.is(x, null)' },
    { from: /expect\(([^)]+)\)\.toBeUndefined\(\)/g, to: 'assert.is($1, undefined)', desc: 'toBeUndefined → assert.is(x, undefined)' },
    { from: /expect\(([^)]+)\)\.toBeTruthy\(\)/g, to: 'assert.ok($1)', desc: 'toBeTruthy → assert.ok' },
    { from: /expect\(([^)]+)\)\.toBeFalsy\(\)/g, to: 'assert.not.ok($1)', desc: 'toBeFalsy → assert.not.ok' },
    { from: /expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, to: 'assert.ok($1.includes($2))', desc: 'toContain → assert.ok(x.includes(y))' },
    { from: /expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, to: 'assert.is($1.length, $2)', desc: 'toHaveLength → assert.is(x.length, y)' },
    { from: /expect\(([^)]+)\)\.toMatch\(([^)]+)\)/g, to: 'assert.match($1, $2)', desc: 'toMatch → assert.match' },
    { from: /expect\(([^)]+)\)\.not\.toThrow\(\)/g, to: 'assert.not.throws(() => $1)', desc: 'not.toThrow → assert.not.throws' },
    { from: /expect\(\(\)\s*=>\s*([^)]+)\)\.not\.toThrow\(\)/g, to: 'assert.not.throws(() => $1)', desc: 'not.toThrow function → assert.not.throws' }
  ];
  
  expectReplacements.forEach(({ from, to, desc }) => {
    if (from.test(content)) {
      content = content.replace(from, to);
      changes.push(`✓ ${desc}`);
    }
  });
  
  // 7. Handle skip patterns
  content = content.replace(/it\.skip\(/g, 'test.skip(');
  content = content.replace(/test\.skip\(/g, 'test.skip(');
  content = content.replace(/describe\.skip\(/g, '// test.skip(');
  
  // 8. Remove extra closing braces from describe blocks
  // This is a heuristic - look for standalone closing braces that are likely from describe blocks
  content = content.replace(/^\s*\}\);\s*$/gm, '');
  content = content.replace(/^\s*\}\);\s*$/gm, ''); // Run twice to catch nested ones
  if (content !== originalContent) {
    changes.push('✓ Removed describe block closing braces');
  }
  
  // 9. Handle beforeEach/afterEach (convert to helper functions)
  const beforeEachRegex = /beforeEach\(\(\)\s*=>\s*\{([^}]*)\}\);?/g;
  let beforeEachMatch;
  while ((beforeEachMatch = beforeEachRegex.exec(content)) !== null) {
    const setupCode = beforeEachMatch[1].trim();
    content = content.replace(beforeEachMatch[0], `// Setup function (was beforeEach)\nconst setup = () => {\n${setupCode}\n};`);
    changes.push('⚠️  Converted beforeEach to setup function (manual review needed)');
  }
  
  // 10. Add test.run() at the end if not present
  if (!content.includes('test.run()')) {
    content += '\n\ntest.run();\n';
    changes.push('✓ Added test.run()');
  }
  
  // 11. Handle common patterns that need manual review
  if (content.includes('beforeAll') || content.includes('afterAll') || content.includes('afterEach')) {
    changes.push('⚠️  Lifecycle hooks detected - manual review needed');
  }
  
  if (content.includes('jest.')) {
    changes.push('⚠️  Jest-specific features detected - manual review needed');
  }
  
  if (content.includes('spy') || content.includes('mock')) {
    changes.push('⚠️  Mocking detected - may need manual adjustment');
  }
  
  // Write the migrated file
  const newPath = filePath.replace('.test.ts', '.uvu.ts');
  fs.writeFileSync(newPath, content);
  
  // Show summary
  console.log(`📝 Changes made:`);
  changes.forEach(change => console.log(`   ${change}`));
  console.log(`✅ Created: ${newPath}`);
  
  return { originalPath: filePath, newPath, changes: changes.length };
};

const main = () => {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Jest to uvu Migration Script

Usage:
  node scripts/migrate-to-uvu.js <test-file>           # Migrate single file
  node scripts/migrate-to-uvu.js --all                # Migrate all test files
  node scripts/migrate-to-uvu.js --batch=1            # Migrate batch (1-4)

Examples:
  node scripts/migrate-to-uvu.js test/language-features/tuple.test.ts
  node scripts/migrate-to-uvu.js --batch=1
  node scripts/migrate-to-uvu.js --all
    `);
    return;
  }
  
  const batches = {
    1: [
      'test/language-features/record_tuple_unit.test.ts',
      'test/language-features/tuple.test.ts',
      'test/type-system/print_type_pollution.test.ts',
      'test/type-system/option_unification.test.ts'
    ],
    2: [
      'test/language-features/closure.test.ts',
      'test/language-features/head_function.test.ts',
      'test/integration/import_relative.test.ts'
    ],
    3: [
      'test/features/operators/dollar-operator.test.ts',
      'test/features/operators/safe_thrush_operator.test.ts',
      'test/features/pattern-matching/pattern_matching_failures.test.ts',
      'test/features/effects/effects_phase2.test.ts',
      'test/features/effects/effects_phase3.test.ts'
    ],
    4: [
      'test/features/adt.test.ts',
      'test/language-features/combinators.test.ts',
      'test/integration/repl-integration.test.ts'
    ]
  };
  
  let filesToMigrate = [];
  
  if (args[0] === '--all') {
    // Find all test files
    const { execSync } = require('child_process');
    const testFiles = execSync('find test -name "*.test.ts" -type f', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f && !f.includes('adt_limitations')); // Skip already migrated
    filesToMigrate = testFiles;
  } else if (args[0].startsWith('--batch=')) {
    const batchNum = parseInt(args[0].split('=')[1]);
    if (batches[batchNum]) {
      filesToMigrate = batches[batchNum].filter(f => fs.existsSync(f));
    } else {
      console.error(`❌ Invalid batch number. Use 1-4.`);
      return;
    }
  } else {
    // Single file
    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }
    filesToMigrate = [filePath];
  }
  
  console.log(`🎯 Migrating ${filesToMigrate.length} file(s)...`);
  
  const results = [];
  for (const file of filesToMigrate) {
    try {
      const result = migrateFile(file);
      results.push(result);
    } catch (error) {
      console.error(`❌ Error migrating ${file}:`, error.message);
    }
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Files processed: ${results.length}`);
  console.log(`   Total changes: ${results.reduce((sum, r) => sum + r.changes, 0)}`);
  
  console.log(`\n🔍 Next steps:`);
  console.log(`   1. Review migrated files for manual adjustments`);
  console.log(`   2. Test with: npm run test:uvu`);
  console.log(`   3. Fix any remaining issues`);
  console.log(`   4. Remove original .test.ts files when satisfied`);
};

main();