#!/usr/bin/env ts-node

import { readFileSync, writeFileSync } from 'fs';

interface MigrationStats {
  assertionsConverted: number;
  testsConverted: number;
  errors: string[];
}

class UvuToBunMigrator {
  private stats: MigrationStats = {
    assertionsConverted: 0,
    testsConverted: 0,
    errors: []
  };

  /**
   * Convert imports from uvu to Bun test
   */
  private convertImports(content: string): string {
    let converted = content;

    // Remove uvu imports
    converted = converted.replace(/import\s+{\s*test\s*}\s+from\s+['"]uvu['"];?\s*\n/g, '');
    converted = converted.replace(/import\s+\*\s+as\s+assert\s+from\s+['"]uvu\/assert['"];?\s*\n/g, '');

    // Add Bun test import at the top after other imports
    const lines = converted.split('\n');
    let insertIndex = 0;
    
    // Find the last import line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') && !lines[i].includes('bun:test')) {
        insertIndex = i + 1;
      }
    }

    // Insert Bun test import
    lines.splice(insertIndex, 0, "import { describe, test, expect } from 'bun:test';");
    
    return lines.join('\n');
  }

  /**
   * Convert uvu assertions to Bun expect calls with proper parsing
   */
  private convertAssertions(content: string): string {
    let converted = content;
    let assertionCount = 0;

    // Helper function to find matching parenthesis
    const findMatchingParen = (str: string, startIndex: number): number => {
      let count = 1;
      let i = startIndex + 1;
      while (i < str.length && count > 0) {
        if (str[i] === '(') count++;
        else if (str[i] === ')') count--;
        i++;
      }
      return count === 0 ? i - 1 : -1;
    };

    // Helper function to parse function arguments properly
    const parseArguments = (argsStr: string): string[] => {
      const args: string[] = [];
      let current = '';
      let parenCount = 0;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let stringChar = '';

      for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];
        
        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && argsStr[i-1] !== '\\') {
          inString = false;
        }

        if (!inString) {
          if (char === '(') parenCount++;
          else if (char === ')') parenCount--;
          else if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
          else if (char === ',' && parenCount === 0 && braceCount === 0 && bracketCount === 0) {
            args.push(current.trim());
            current = '';
            continue;
          }
        }

        current += char;
      }
      
      if (current.trim()) {
        args.push(current.trim());
      }

      return args;
    };

    // Convert assert.is(a, b) -> expect(a).toBe(b)
    let assertIsMatch;
    const assertIsRegex = /assert\.is\(/g;
    while ((assertIsMatch = assertIsRegex.exec(converted)) !== null) {
      const startIndex = assertIsMatch.index;
      const openParenIndex = startIndex + assertIsMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length === 2) {
          const replacement = `expect(${args[0]}).toBe(${args[1]})`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          // Reset regex since string changed
          assertIsRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.equal(a, b) -> expect(a).toEqual(b)
    let assertEqualMatch;
    const assertEqualRegex = /assert\.equal\(/g;
    while ((assertEqualMatch = assertEqualRegex.exec(converted)) !== null) {
      const startIndex = assertEqualMatch.index;
      const openParenIndex = startIndex + assertEqualMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length === 2) {
          const replacement = `expect(${args[0]}).toEqual(${args[1]})`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertEqualRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.ok(a) -> expect(a).toBeTruthy()
    let assertOkMatch;
    const assertOkRegex = /assert\.ok\(/g;
    while ((assertOkMatch = assertOkRegex.exec(converted)) !== null) {
      const startIndex = assertOkMatch.index;
      const openParenIndex = startIndex + assertOkMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length >= 1) {
          const replacement = `expect(${args[0]}).toBeTruthy()`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertOkRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.throws(fn) -> expect(fn).toThrow()
    let assertThrowsMatch;
    const assertThrowsRegex = /assert\.throws\(/g;
    while ((assertThrowsMatch = assertThrowsRegex.exec(converted)) !== null) {
      const startIndex = assertThrowsMatch.index;
      const openParenIndex = startIndex + assertThrowsMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length >= 1) {
          const replacement = `expect(${args[0]}).toThrow()`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertThrowsRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.not.throws(fn) -> expect(fn).not.toThrow()
    let assertNotThrowsMatch;
    const assertNotThrowsRegex = /assert\.not\.throws\(/g;
    while ((assertNotThrowsMatch = assertNotThrowsRegex.exec(converted)) !== null) {
      const startIndex = assertNotThrowsMatch.index;
      const openParenIndex = startIndex + assertNotThrowsMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length >= 1) {
          const replacement = `expect(${args[0]}).not.toThrow()`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertNotThrowsRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.not.ok(a) -> expect(a).toBeFalsy()
    let assertNotOkMatch;
    const assertNotOkRegex = /assert\.not\.ok\(/g;
    while ((assertNotOkMatch = assertNotOkRegex.exec(converted)) !== null) {
      const startIndex = assertNotOkMatch.index;
      const openParenIndex = startIndex + assertNotOkMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length >= 1) {
          const replacement = `expect(${args[0]}).toBeFalsy()`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertNotOkRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.match(value, regex) -> expect(value).toMatch(regex)
    let assertMatchMatch;
    const assertMatchRegex = /assert\.match\(/g;
    while ((assertMatchMatch = assertMatchRegex.exec(converted)) !== null) {
      const startIndex = assertMatchMatch.index;
      const openParenIndex = startIndex + assertMatchMatch[0].length - 1;
      const closeParenIndex = findMatchingParen(converted, openParenIndex);
      
      if (closeParenIndex !== -1) {
        const argsStr = converted.substring(openParenIndex + 1, closeParenIndex);
        const args = parseArguments(argsStr);
        
        if (args.length === 2) {
          const replacement = `expect(${args[0]}).toMatch(${args[1]})`;
          converted = converted.substring(0, startIndex) + replacement + converted.substring(closeParenIndex + 1);
          assertionCount++;
          assertMatchRegex.lastIndex = 0;
        }
      }
    }

    // Convert assert.unreachable(msg) -> throw new Error(msg)
    converted = converted.replace(/assert\.unreachable\(([^)]+)\)/g, 'throw new Error($1)');

    this.stats.assertionsConverted += assertionCount;
    return converted;
  }

  /**
   * Remove test.run() calls
   */
  private removeTestRun(content: string): string {
    return content.replace(/test\.run\(\);?\s*\n?/g, '');
  }

  /**
   * Count tests for statistics
   */
  private countTests(content: string): number {
    const testMatches = content.match(/test\(/g);
    return testMatches ? testMatches.length : 0;
  }

  /**
   * Process a single file
   */
  public processFile(filePath: string, dryRun: boolean = false): boolean {
    try {
      const content = readFileSync(filePath, 'utf-8');
      
      // Check if this is a uvu test file
      if (!content.includes("from 'uvu'") && !content.includes('from "uvu"')) {
        return false;
      }

      let converted = content;
      
      // Apply conversions in order
      converted = this.convertImports(converted);
      converted = this.convertAssertions(converted);
      converted = this.removeTestRun(converted);

      // Count tests
      this.stats.testsConverted += this.countTests(content);

      if (!dryRun) {
        // Create backup
        const backupPath = filePath + '.uvu.bak';
        writeFileSync(backupPath, content);
        
        // Write converted file
        writeFileSync(filePath, converted);
      }

      return true;
      
    } catch (error) {
      const errorMsg = `Error processing ${filePath}: ${error}`;
      this.stats.errors.push(errorMsg);
      return false;
    }
  }

  public getStats(): MigrationStats {
    return this.stats;
  }
}

// Test on single file if run directly
if (require.main === module) {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  
  if (!filePath) {
    console.log('Usage: ts-node migrate-uvu-to-bun-fixed.ts <file> [--dry-run]');
    process.exit(1);
  }

  const migrator = new UvuToBunMigrator();
  const success = migrator.processFile(filePath, dryRun);
  const stats = migrator.getStats();

  if (success) {
    console.log(`✅ ${dryRun ? 'Would convert' : 'Converted'} ${filePath}`);
    console.log(`📊 Tests: ${stats.testsConverted}, Assertions: ${stats.assertionsConverted}`);
    
    if (stats.errors.length > 0) {
      console.log(`❌ Errors:`);
      stats.errors.forEach(error => console.log(`   ${error}`));
    }
  } else {
    console.log(`⏭️ Skipped ${filePath} (not a uvu test file)`);
  }
}

export { UvuToBunMigrator };