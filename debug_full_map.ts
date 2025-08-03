#!/usr/bin/env bun

import { parseAndType } from './test/utils.ts';

try {
  console.log("Testing full map application:");
  const result = parseAndType(`
    getNames = map @name;
    people = [{@name "Alice", @age 30}, {@name "Bob", @age 25}];
    getNames people
  `);
  console.log("Raw type structure:", JSON.stringify(result.type, null, 2));
} catch (error) {
  console.error("Error:", error.message);
}