#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

const MIGRATED_TESTS_CONFIG = 'uvu-migrated-tests.json';

const loadMigratedTests = () => {
  if (fs.existsSync(MIGRATED_TESTS_CONFIG)) {
    return JSON.parse(fs.readFileSync(MIGRATED_TESTS_CONFIG, 'utf8'));
  }
  return { migratedFiles: [] };
};

const main = () => {
  const config = loadMigratedTests();
  
  if (config.migratedFiles.length === 0) {
    console.log('📝 No migrated test files found. Run migration first:');
    console.log('   node scripts/migrate-to-uvu.js --simple <test-file>');
    process.exit(0);
  }
  
  console.log(`🧪 Running ${config.migratedFiles.length} migrated uvu test file(s)...`);
  
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTime = 0;
  let hasFailures = false;
  
  for (const testFile of config.migratedFiles) {
    console.log(`\n📁 Running: ${testFile}`);
    
    try {
      const startTime = Date.now();
      const result = execSync(`npx tsx ${testFile}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Parse uvu output for test counts
      const lines = result.split('\n');
      const summaryLine = lines.find(line => line.includes('Total:'));
      if (summaryLine) {
        const matches = summaryLine.match(/Total:\s*(\d+)/);
        if (matches) {
          const tests = parseInt(matches[1]);
          totalTests += tests;
          totalPassed += tests; // Assume all passed if no error
        }
      }
      
      totalTime += duration;
      console.log(`   ✅ Completed in ${duration}ms`);
      
    } catch (error) {
      hasFailures = true;
      totalFailed++;
      
      // Output the actual test failure details
      if (error.stdout) {
        console.log(error.stdout);
      }
      if (error.stderr) {
        console.log(error.stderr);
      }
      
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total tests: ${totalTests}`);
  console.log(`   Passed: ${totalPassed}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Average: ${Math.round(totalTime / config.migratedFiles.length)}ms per file`);
  
  // Exit with non-zero code if any tests failed
  if (hasFailures) {
    process.exit(1);
  }
};

main();