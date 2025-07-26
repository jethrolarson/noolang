#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const fixUvuFile = (filePath) => {
  console.log(`🔧 Fixing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let fixed = false;
  
  // Fix missing closing braces for test functions
  // Pattern: test('...', () => {
  //   ... content ...
  //   assert.something(...);
  //
  //
  // test.run();
  
  // Look for pattern where there's no closing brace before test.run()
  const testRunMatch = content.match(/test\.run\(\);?\s*$/);
  if (testRunMatch) {
    const beforeTestRun = content.substring(0, content.lastIndexOf('test.run()'));
    
    // Count open and close braces in test functions
    const testMatches = beforeTestRun.match(/test\(['"`][^'"`]+['"`],\s*\(\)\s*=>\s*\{/g);
    if (testMatches) {
      const openBraces = testMatches.length;
      const closeBraces = (beforeTestRun.match(/^\s*\}\);\s*$/gm) || []).length;
      
      if (openBraces > closeBraces) {
        console.log(`  - Found ${openBraces} test functions, ${closeBraces} closing braces`);
        
        // Add missing closing braces before test.run()
        const missingBraces = openBraces - closeBraces;
        const closingBraces = Array(missingBraces).fill('\t});').join('\n');
        content = content.replace(/\n\n\ntest\.run\(\);/, `\n${closingBraces}\n\ntest.run();`);
        content = content.replace(/\n\ntest\.run\(\);/, `\n${closingBraces}\n\ntest.run();`);
        fixed = true;
        console.log(`  ✓ Added ${missingBraces} missing closing braces`);
      }
    }
  }
  
  // Fix any remaining expect patterns that weren't converted
  if (content.includes('expect(')) {
    content = content.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.is($1, $2)');
    content = content.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.equal($1, $2)');
    fixed = true;
    console.log(`  ✓ Fixed remaining expect patterns`);
  }
  
  // Remove extra empty lines
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (fixed) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Fixed syntax issues in ${filePath}`);
  } else {
    console.log(`  ℹ️  No fixes needed for ${filePath}`);
  }
  
  return fixed;
};

const main = () => {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/fix-uvu-syntax.js <file1.uvu.ts> [file2.uvu.ts] ...');
    console.log('   or: node scripts/fix-uvu-syntax.js --batch=2  # Fix all Batch 2 files');
    return;
  }
  
  let filesToFix = [];
  
  if (args[0] === '--batch=2') {
    filesToFix = [
      'test/language-features/closure.uvu.ts',
      'test/language-features/head_function.uvu.ts',
      'test/integration/import_relative.uvu.ts'
    ].filter(f => fs.existsSync(f));
  } else {
    filesToFix = args.filter(f => fs.existsSync(f));
  }
  
  console.log(`🎯 Fixing ${filesToFix.length} file(s)...`);
  
  let fixedCount = 0;
  for (const file of filesToFix) {
    if (fixUvuFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n📊 Summary: Fixed ${fixedCount}/${filesToFix.length} files`);
};

main();