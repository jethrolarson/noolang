#!/usr/bin/env bun

import { parseAndType } from './test/utils.ts';
import { typeToString } from './src/typer/helpers.ts';

try {
  console.log("=== Testing raw variable names ===");
  
  console.log("1. Direct @name:");
  const result1 = parseAndType('@name');
  console.log("  Normalized:", typeToString(result1.type, result1.state.substitution, true, true));
  console.log("  Raw vars:  ", typeToString(result1.type, result1.state.substitution, true, false));
  
  console.log("\n2. Assigned x = @name; x:");
  const result2 = parseAndType('x = @name; x');
  console.log("  Normalized:", typeToString(result2.type, result2.state.substitution, true, true));
  console.log("  Raw vars:  ", typeToString(result2.type, result2.state.substitution, true, false));
  
  console.log("\n3. Direct map @name:");
  const result3 = parseAndType('map @name');
  console.log("  Normalized:", typeToString(result3.type, result3.state.substitution, true, true));
  console.log("  Raw vars:  ", typeToString(result3.type, result3.state.substitution, true, false));
  
  console.log("\n4. Assigned f = map @name; f:");
  const result4 = parseAndType('f = map @name; f');
  console.log("  Normalized:", typeToString(result4.type, result4.state.substitution, true, true));
  console.log("  Raw vars:  ", typeToString(result4.type, result4.state.substitution, true, false));
  
} catch (error) {
  console.error("Error:", error.message);
}