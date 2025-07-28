#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = 'src/parser/__tests__/parser.test.ts';

function migrateParserTest() {
  console.log('🔄 Migrating parser test file...');
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Track modifications
  let modifications = 0;
  
  // Convert all describe blocks to test functions
  const describeBlocks = [
    'Type Definitions (ADTs)',
    'Pattern Matching', 
    'Where Expressions',
    'Mutable Definitions and Mutations',
    'Constraint Definitions and Implementations',
    'Advanced Type Expressions',
    'Constraint Expressions',
    'Error Conditions',
    'Operator Precedence',
    'Top-level sequence parsing',
    'Type annotation parsing',
    'Top-level definitions with type annotations',
    'Effect parsing',
    'Edge Cases and Error Conditions'
  ];
  
  // Convert describe blocks
  for (const blockName of describeBlocks) {
    const oldPattern = `describe('${blockName}', () => {`;
    if (content.includes(oldPattern)) {
      // Remove the describe wrapper but keep the tests
      const regex = new RegExp(`describe\\('${blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', \\(\\) => \\{`, 'g');
      content = content.replace(regex, `// ${blockName} tests`);
      modifications++;
    }
  }
  
  // Convert test function names
  content = content.replace(/\ttest\('should (.+?)', \(\) => \{/g, (match, testName) => {
    modifications++;
    // Extract the describe context from surrounding comment
    const lines = content.split('\n');
    const matchIndex = content.indexOf(match);
    const linesBefore = content.substring(0, matchIndex).split('\n');
    const currentLineIndex = linesBefore.length - 1;
    
    // Look backwards for the describe context
    for (let i = currentLineIndex; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('// ') && line.includes(' tests')) {
        const contextName = line.replace('// ', '').replace(' tests', '');
        return `test('${contextName} - should ${testName}', () => {`;
      }
    }
    
    return `test('Parser - should ${testName}', () => {`;
  });
  
  // Convert expect statements to assert statements
  const expectConversions = [
    [/expect\((.+?)\)\.toHaveLength\((.+?)\)/g, 'assert.is($1.length, $2)'],
    [/expect\((.+?)\)\.toBe\((.+?)\)/g, 'assert.is($1, $2)'],
    [/expect\((.+?)\)\.toEqual\((.+?)\)/g, 'assert.equal($1, $2)'],
    [/expect\((.+?)\)\.toContain\((.+?)\)/g, 'assert.ok($1.includes($2))'],
    [/expect\((.+?)\)\.toHaveProperty\((.+?)\)/g, 'assert.ok($1.hasOwnProperty($2))'],
    [/expect\(Array\.isArray\((.+?)\)\)\.toBe\(true\)/g, 'assert.is(Array.isArray($1), true)'],
    [/expect\(\(\) => (.+?)\)\.toThrow\((.+?)\)/g, 'assert.throws(() => $1, $2)'],
    [/expect\(\(\) => (.+?)\)\.toThrow\(\)/g, 'assert.throws(() => $1)'],
    [/expect\(\(\) => (.+?)\)\.not\.toThrow\(\)/g, 'assert.not.throws(() => $1)']
  ];
  
  for (const [pattern, replacement] of expectConversions) {
    const before = content;
    content = content.replace(pattern, replacement);
    if (content !== before) {
      modifications++;
    }
  }
  
  // Remove closing braces for describe blocks (but be careful not to remove test braces)
  // This is tricky, so we'll do it manually for the major blocks
  
  // Clean up any remaining Jest artifacts
  content = content.replace(/}\);$/gm, '});');
  
  // Add test.run() at the end
  if (!content.includes('test.run()')) {
    content += '\n\ntest.run();\n';
    modifications++;
  }
  
  fs.writeFileSync(filePath, content);
  
  console.log(`✅ Migration complete! Made ${modifications} modifications.`);
  return modifications;
}

if (require.main === module) {
  migrateParserTest();
}

module.exports = migrateParserTest;