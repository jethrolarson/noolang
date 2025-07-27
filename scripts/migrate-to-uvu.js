#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration file to track migrated tests
const MIGRATED_TESTS_CONFIG = 'uvu-migrated-tests.json';

const loadMigratedTests = () => {
  if (fs.existsSync(MIGRATED_TESTS_CONFIG)) {
    return JSON.parse(fs.readFileSync(MIGRATED_TESTS_CONFIG, 'utf8'));
  }
  return { migratedFiles: [], lastUpdated: new Date().toISOString() };
};

const saveMigratedTests = (config) => {
  config.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MIGRATED_TESTS_CONFIG, JSON.stringify(config, null, 2));
};

const migrateFile = (filePath) => {
  console.log(`\n🔄 Migrating: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Track changes for summary
  const changes = [];
  
  // 1. Add uvu imports at the top, but keep Jest imports for backward compatibility
  if (!content.includes("import { test } from 'uvu'")) {
    // Find the first import or add at the beginning
    const importMatch = content.match(/^(import.*\n)+/m);
    if (importMatch) {
      const firstImportEnd = content.indexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, firstImportEnd) + 
                "// uvu test imports\nimport { test as uvuTest } from 'uvu';\nimport * as assert from 'uvu/assert';\n\n" +
                content.slice(firstImportEnd);
    } else {
      content = "// uvu test imports\nimport { test as uvuTest } from 'uvu';\nimport * as assert from 'uvu/assert';\n\n" + content;
    }
    changes.push('✓ Added uvu imports');
  }
  
  // 2. Add environment detection and dual compatibility
  const compatibilityCode = `
// Dual Jest/uvu compatibility
const isJest = typeof jest !== 'undefined';
const testFn = isJest ? test : uvuTest;
const describeFn = isJest ? describe : (name, fn) => fn(); // uvu doesn't use describe, just run the function
const expectFn = isJest ? expect : (actual) => ({
  toBe: (expected) => assert.is(actual, expected),
  toEqual: (expected) => {
    if (Array.isArray(expected) && expected.some(item => item && typeof item === 'object' && item.asymmetricMatch)) {
      // Handle expect.anything() in arrays
      assert.is(Array.isArray(actual), true);
      assert.is(actual.length, expected.length);
      for (let i = 0; i < expected.length; i++) {
        if (expected[i] && expected[i].asymmetricMatch) {
          assert.ok(actual[i] !== undefined);
        } else {
          assert.equal(actual[i], expected[i]);
        }
      }
    } else {
      assert.equal(actual, expected);
    }
  },
  toThrow: () => assert.throws(actual),
});
const expectAnything = () => ({ asymmetricMatch: () => true });

`;

  if (!content.includes('// Dual Jest/uvu compatibility')) {
    // Insert after imports
    const lastImportMatch = content.match(/^import.*$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const insertPos = content.indexOf(lastImport) + lastImport.length + 1;
      content = content.slice(0, insertPos) + compatibilityCode + content.slice(insertPos);
      changes.push('✓ Added Jest/uvu compatibility layer');
    }
  }
  
  // 3. Replace test and describe calls to use compatibility functions
  content = content.replace(/\btest\(/g, 'testFn(');
  content = content.replace(/\bdescribe\(/g, 'describeFn(');
  if (content !== originalContent) {
    changes.push('✓ Updated test and describe calls');
  }
  
  // 4. Replace expect calls to use compatibility function
  content = content.replace(/\bexpect\(/g, 'expectFn(');
  content = content.replace(/expect\.anything\(\)/g, 'expectAnything()');
  if (content !== originalContent) {
    changes.push('✓ Updated expect calls');
  }
  
  // 5. Add uvu test runner at the end
  if (!content.includes('if (!isJest)')) {
    content += `
// Run tests with uvu if not in Jest environment
if (!isJest && typeof uvuTest.run === 'function') {
  uvuTest.run();
}
`;
    changes.push('✓ Added uvu test runner');
  }
  
  // Write the migrated file (same filename)
  fs.writeFileSync(filePath, content);
  
  // Show summary
  console.log(`📝 Changes made:`);
  changes.forEach(change => console.log(`   ${change}`));
  console.log(`✅ Migrated: ${filePath}`);
  
  return { filePath, changes: changes.length };
};

const main = () => {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Jest to uvu Migration Script (Config-Based)

Usage:
  node scripts/migrate-to-uvu.js <test-file>           # Migrate single file
  node scripts/migrate-to-uvu.js --list               # List current migration status
  node scripts/migrate-to-uvu.js --simple <file>      # Migrate one simple file

Examples:
  node scripts/migrate-to-uvu.js test/language-features/tuple.test.ts
  node scripts/migrate-to-uvu.js --simple test/language-features/record_tuple_unit.test.ts
  node scripts/migrate-to-uvu.js --list
    `);
    return;
  }
  
  const config = loadMigratedTests();
  
  if (args[0] === '--list') {
    console.log('📋 Migration Status:');
    console.log(`   Migrated files: ${config.migratedFiles.length}`);
    config.migratedFiles.forEach(file => console.log(`   ✅ ${file}`));
    return;
  }
  
  let filesToMigrate = [];
  
  if (args[0] === '--simple') {
    // Migrate a single simple file
    const filePath = args[1];
    if (!filePath) {
      console.error('❌ Please specify a file to migrate');
      return;
    }
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }
    filesToMigrate = [filePath];
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
      
      // Add to migrated files config
      if (!config.migratedFiles.includes(file)) {
        config.migratedFiles.push(file);
      }
    } catch (error) {
      console.error(`❌ Error migrating ${file}:`, error.message);
    }
  }
  
  // Save updated config
  saveMigratedTests(config);
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Files processed: ${results.length}`);
  console.log(`   Total changes: ${results.reduce((sum, r) => sum + r.changes, 0)}`);
  console.log(`   Total migrated files: ${config.migratedFiles.length}`);
  
  console.log(`\n🔍 Next steps:`);
  console.log(`   1. Test with Jest: npm test -- --testPathPattern="${path.basename(filesToMigrate[0], '.test.ts')}"`);
  console.log(`   2. Test with uvu: npx uvu ${filesToMigrate[0]} --require tsx/cjs`);
  console.log(`   3. Update Jest config to exclude: ${filesToMigrate[0]}`);
};

main();