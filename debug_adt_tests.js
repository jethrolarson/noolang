const { execSync } = require('child_process');
const fs = require('fs');

// Read the ADT test file
const testFile = fs.readFileSync('test/features/adt.test.ts', 'utf8');

// Extract test names using regex
const testMatches = testFile.match(/test\('([^']+)',/g);
const testNames = testMatches.map(match => match.replace(/test\('|',/g, ''));

console.log(`Found ${testNames.length} tests:`);
testNames.forEach((name, i) => {
  console.log(`${i + 1}. ${name}`);
});

console.log('\nRunning tests to see overall result...');
try {
  const result = execSync('npx tsx test/features/adt.test.ts', { encoding: 'utf8' });
  console.log(result);
} catch (error) {
  console.log('Error running tests:', error.stdout || error.message);
}