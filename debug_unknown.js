#!/usr/bin/env node

// Debug the "unknown" issue
const { parseAndType } = require('./test/utils.ts');

try {
  console.log("Testing: fn a => @name (@person a)");
  const result = parseAndType('fn a => @name (@person a)');
  console.log("Result type:", JSON.stringify(result.type, null, 2));
  
  if (result.type.kind === 'function' && result.type.constraints) {
    console.log("Constraints:", JSON.stringify(result.type.constraints, null, 2));
  }
} catch (error) {
  console.error("Error:", error.message);
}