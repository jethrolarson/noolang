#!/usr/bin/env bun

import { parseAndType } from './test/utils.ts';

try {
  console.log("Testing: getNames = map @name");
  const result = parseAndType('getNames = map @name');
  console.log("Raw type structure:", JSON.stringify(result.type, null, 2));
} catch (error) {
  console.error("Error:", error.message);
}