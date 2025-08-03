#!/usr/bin/env bun

import { parseAndType } from './test/utils.ts';

try {
  console.log("Testing: @name <| @person");
  const result = parseAndType('@name <| @person');
  console.log("Raw type structure:", JSON.stringify(result.type, null, 2));
  
  if (result.type.kind === 'function' && result.type.constraints) {
    console.log("Function constraints:", JSON.stringify(result.type.constraints, null, 2));
  }
  
  if (result.type.kind === 'function' && result.type.params.length > 0) {
    const param = result.type.params[0];
    if (param.kind === 'variable' && param.constraints) {
      console.log("Parameter constraints:", JSON.stringify(param.constraints, null, 2));
    }
  }
} catch (error) {
  console.error("Error:", error.message);
}