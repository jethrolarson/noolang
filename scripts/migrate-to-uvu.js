#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration file to track migrated tests
const MIGRATED_TESTS_CONFIG = 'uvu-migrated-tests.json';
const JEST_CONFIG_FILE = 'jest.config.cjs';

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

const updateJestConfig = (filePath) => {
  const configFiles = ['jest.config.cjs', 'jest.config.swc.cjs'];
  
  configFiles.forEach(configFile => {
    if (!fs.existsSync(configFile)) return;
    
    let jestConfig = fs.readFileSync(configFile, 'utf8');
    
    // Find the testPathIgnorePatterns array
    if (jestConfig.includes('testPathIgnorePatterns:')) {
      // Add the file to the ignore patterns
      const newPattern = `\t\t'${filePath}', // Migrated to uvu`;
      if (!jestConfig.includes(filePath)) {
        jestConfig = jestConfig.replace(
          /testPathIgnorePatterns:\s*\[([^\]]*)\]/,
          (match, content) => {
            if (content.includes('//')) {
              // Insert before the comment line
              return match.replace(/(\t\t.*\/\/ [^,]*)(,?\s*\])/,
                `$1\n${newPattern}$2`);
            } else {
              // Add at the end
              return `testPathIgnorePatterns: [${content.trim()}\n${newPattern}\n\t]`;
            }
          }
        );
        fs.writeFileSync(configFile, jestConfig);
      }
    }
  });
  
  console.log(`   ✓ Updated Jest configs to exclude: ${filePath}`);
};

const migrateFile = (filePath) => {
  console.log(`\n🔄 Migrating: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Track changes for summary
  const changes = [];
  
  // 1. Replace imports - remove Jest imports and add uvu imports
  if (content.includes("from '@jest/globals'")) {
    content = content.replace(/import.*from '@jest\/globals'.*;?\n/g, '');
    changes.push('✓ Removed Jest globals import');
  }
  
  // Add uvu imports at the top
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
  
  // 2. Convert describe blocks - flatten them
  content = content.replace(/describe\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g, '// Test suite: $1');
  if (content !== originalContent) {
    changes.push('✓ Flattened describe blocks');
  }
  
  // 3. Convert it/test calls
  content = content.replace(/(\s*)(it|test)\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g, "$1test('$3', () => {");
  changes.push('✓ Converted test calls');
  
  // 4. Convert expect assertions to assert
  const expectReplacements = [
    { from: /expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, to: 'assert.is($1, $2)', desc: 'toBe → assert.is' },
    { from: /expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, to: 'assert.equal($1, $2)', desc: 'toEqual → assert.equal' },
    { from: /expect\(([^)]+)\)\.toBeNull\(\)/g, to: 'assert.is($1, null)', desc: 'toBeNull → assert.is(x, null)' },
    { from: /expect\(([^)]+)\)\.toBeUndefined\(\)/g, to: 'assert.is($1, undefined)', desc: 'toBeUndefined → assert.is(x, undefined)' },
    { from: /expect\(([^)]+)\)\.toBeTruthy\(\)/g, to: 'assert.ok($1)', desc: 'toBeTruthy → assert.ok' },
    { from: /expect\(([^)]+)\)\.toBeFalsy\(\)/g, to: 'assert.not.ok($1)', desc: 'toBeFalsy → assert.not.ok' },
    { from: /expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, to: 'assert.ok($1.includes($2))', desc: 'toContain → assert.ok(x.includes(y))' },
    { from: /expect\(([^)]+)\)\.toHaveLength\(([^)]+)\)/g, to: 'assert.is($1.length, $2)', desc: 'toHaveLength → assert.is(x.length, y)' },
    { from: /expect\(([^)]+)\)\.toMatch\(([^)]+)\)/g, to: 'assert.match($1, $2)', desc: 'toMatch → assert.match' },
    { from: /expect\(\(\)\s*=>\s*([^)]+)\)\.toThrow\(\)/g, to: 'assert.throws(() => $1)', desc: 'toThrow → assert.throws' },
    { from: /expect\(([^)]+)\)\.toThrow\(\)/g, to: 'assert.throws($1)', desc: 'toThrow → assert.throws' },
  ];
  
  expectReplacements.forEach(({ from, to, desc }) => {
    if (from.test(content)) {
      content = content.replace(from, to);
      changes.push(`✓ ${desc}`);
    }
  });
  
  // 5. Handle expect.anything() - replace with less strict assertions
  if (content.includes('expect.anything()')) {
    content = content.replace(/expect\.anything\(\)/g, 'undefined');
    // For arrays containing expect.anything(), we need to handle them manually
    // This is a simplification - real migration may need manual review
    changes.push('⚠️  Replaced expect.anything() - may need manual review');
  }
  
  // 6. Remove extra closing braces from describe blocks
  content = content.replace(/^\s*\}\);\s*$/gm, '');
  if (content !== originalContent) {
    changes.push('✓ Removed describe closing braces');
  }
  
  // 7. Handle beforeEach/afterEach (convert to helper functions)
  const beforeEachRegex = /beforeEach\(\(\)\s*=>\s*\{([^}]*)\}\);?/g;
  let beforeEachMatch;
  while ((beforeEachMatch = beforeEachRegex.exec(content)) !== null) {
    const setupCode = beforeEachMatch[1].trim();
    content = content.replace(beforeEachMatch[0], `// Setup function (was beforeEach)\nconst setup = () => {\n${setupCode}\n};`);
    changes.push('⚠️  Converted beforeEach to setup function');
  }
  
  // 8. Add test.run() at the end
  if (!content.includes('test.run()')) {
    content += '\n\ntest.run();\n';
    changes.push('✓ Added test.run()');
  }
  
  // Write the migrated file (same filename)
  fs.writeFileSync(filePath, content);
  
  // Update Jest config to exclude this file
  updateJestConfig(filePath);
  
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
🚀 Jest to uvu Migration Script (Pure Migration)

Usage:
  node scripts/migrate-to-uvu.js <test-file>           # Migrate single file
  node scripts/migrate-to-uvu.js --list               # List migration status
  node scripts/migrate-to-uvu.js --batch <files...>   # Migrate multiple files

Examples:
  node scripts/migrate-to-uvu.js test/language-features/tuple.test.ts
  node scripts/migrate-to-uvu.js --batch test/language-features/tuple.test.ts test/language-features/head_function.test.ts
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
  
  if (args[0] === '--batch') {
    // Migrate multiple files
    filesToMigrate = args.slice(1).filter(f => fs.existsSync(f));
    if (filesToMigrate.length === 0) {
      console.error('❌ No valid files found in batch');
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
  console.log(`   1. Test uvu: npm run test:uvu`);
  console.log(`   2. Test Jest: npm test (should exclude migrated files)`);
  console.log(`   3. Review any warnings for manual fixes`);
};

main();