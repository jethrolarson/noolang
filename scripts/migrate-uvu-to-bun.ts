#!/usr/bin/env ts-node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

interface MigrationStats {
  filesProcessed: number;
  testsConverted: number;
  assertionsConverted: number;
  errors: string[];
}

class UvuToBunMigrator {
  private stats: MigrationStats = {
    filesProcessed: 0,
    testsConverted: 0,
    assertionsConverted: 0,
    errors: []
  };

  /**
   * Convert uvu assert calls to Bun expect calls
   */
  private convertAssertions(content: string): string {
    let converted = content;
    let assertionCount = 0;

    // Map of uvu assertions to Bun expect calls
    const assertionMappings = [
      // assert.is(a, b) -> expect(a).toBe(b)
      {
        pattern: /assert\.is\(([^,]+),\s*([^)]+)\)/g,
        replacement: 'expect($1).toBe($2)',
        description: 'assert.is -> expect().toBe()'
      },
      
      // assert.equal(a, b) -> expect(a).toEqual(b)
      {
        pattern: /assert\.equal\(([^,]+),\s*([^)]+)\)/g,
        replacement: 'expect($1).toEqual($2)',
        description: 'assert.equal -> expect().toEqual()'
      },
      
      // assert.ok(a) -> expect(a).toBeTruthy()
      {
        pattern: /assert\.ok\(([^)]+)\)/g,
        replacement: 'expect($1).toBeTruthy()',
        description: 'assert.ok -> expect().toBeTruthy()'
      },
      
      // assert.not.ok(a) -> expect(a).toBeFalsy()
      {
        pattern: /assert\.not\.ok\(([^)]+)\)/g,
        replacement: 'expect($1).toBeFalsy()',
        description: 'assert.not.ok -> expect().toBeFalsy()'
      },
      
      // assert.throws(() => ...) -> expect(() => ...).toThrow()
      {
        pattern: /assert\.throws\(([^)]+)\)/g,
        replacement: 'expect($1).toThrow()',
        description: 'assert.throws -> expect().toThrow()'
      },
      
      // assert.not.throws(() => ...) -> expect(() => ...).not.toThrow()
      {
        pattern: /assert\.not\.throws\(([^)]+(?:\([^)]*\))*[^)]*)\)/g,
        replacement: 'expect($1).not.toThrow()',
        description: 'assert.not.throws -> expect().not.toThrow()'
      },
      
      // assert.type(a, 'string') -> expect(typeof a).toBe('string')
      {
        pattern: /assert\.type\(([^,]+),\s*['"]([^'"]+)['"]\)/g,
        replacement: 'expect(typeof $1).toBe(\'$2\')',
        description: 'assert.type -> expect(typeof).toBe()'
      },
      
      // assert.instance(a, Array) -> expect(a).toBeInstanceOf(Array)
      {
        pattern: /assert\.instance\(([^,]+),\s*([^)]+)\)/g,
        replacement: 'expect($1).toBeInstanceOf($2)',
        description: 'assert.instance -> expect().toBeInstanceOf()'
      }
    ];

    // Apply each assertion mapping
    for (const mapping of assertionMappings) {
      const matches = converted.match(mapping.pattern);
      if (matches) {
        converted = converted.replace(mapping.pattern, mapping.replacement);
        assertionCount += matches.length;
        console.log(`  ✓ Converted ${matches.length} ${mapping.description} calls`);
      }
    }

    this.stats.assertionsConverted += assertionCount;
    return converted;
  }

  /**
   * Convert imports from uvu to Bun test
   */
  private convertImports(content: string): string {
    let converted = content;

    // Remove uvu imports and add Bun test imports
    converted = converted.replace(
      /import\s+{\s*test\s*}\s+from\s+['"]uvu['"];?\s*\n/g,
      ''
    );
    
    converted = converted.replace(
      /import\s+\*\s+as\s+assert\s+from\s+['"]uvu\/assert['"];?\s*\n/g,
      ''
    );

    // Add Bun test import at the top (after other imports)
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
   * Convert test structure to use describe blocks for better organization
   */
  private convertTestStructure(content: string): string {
    let converted = content;

    // Remove test.run() calls
    converted = converted.replace(/test\.run\(\);?\s*\n?/g, '');

    // Extract file name for describe block
    const testBlocks: string[] = [];
    const testPattern = /test\((['"][^'"]*['"]|`[^`]*`),\s*\(\)\s*=>\s*{([^{}]*(?:{[^{}]*}[^{}]*)*)}\);?/g;
    
    let match;
    while ((match = testPattern.exec(converted)) !== null) {
      testBlocks.push(match[0]);
      this.stats.testsConverted++;
    }

    // If we have tests, wrap them in a describe block
    if (testBlocks.length > 0) {
      // Try to infer a good describe name from the file or existing comments
      const describeNameMatch = converted.match(/\/\/\s*Test suite:\s*(.+)/);
      const defaultDescribeName = describeNameMatch ? describeNameMatch[1] : 'Test Suite';
      
      console.log(`  ✓ Found ${testBlocks.length} tests to convert`);
    }

    return converted;
  }

  /**
   * Process a single file
   */
  private processFile(filePath: string, dryRun: boolean = false): boolean {
    try {
      console.log(`\n📁 Processing: ${filePath}`);
      
      const content = readFileSync(filePath, 'utf-8');
      
      // Check if this is a uvu test file
      if (!content.includes("from 'uvu'") && !content.includes('from "uvu"')) {
        console.log(`  ⏭️  Skipping: Not a uvu test file`);
        return false;
      }

      let converted = content;
      
      // Apply conversions
      converted = this.convertImports(converted);
      converted = this.convertAssertions(converted);
      converted = this.convertTestStructure(converted);

      if (!dryRun) {
        // Create backup
        const backupPath = filePath + '.uvu.bak';
        writeFileSync(backupPath, content);
        console.log(`  💾 Created backup: ${backupPath}`);
        
        // Write converted file
        writeFileSync(filePath, converted);
        console.log(`  ✅ Converted: ${filePath}`);
      } else {
        console.log(`  🔍 Would convert: ${filePath} (dry-run)`);
      }

      this.stats.filesProcessed++;
      return true;
      
    } catch (error) {
      const errorMsg = `Error processing ${filePath}: ${error}`;
      console.error(`  ❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
      return false;
    }
  }

  /**
   * Find all test files in a directory
   */
  private findTestFiles(dir: string): string[] {
    const testFiles: string[] = [];
    
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          testFiles.push(...this.findTestFiles(fullPath));
        } else if (item.endsWith('.test.ts') && !item.includes('.bun.')) {
          testFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}: ${error}`);
    }
    
    return testFiles;
  }

  /**
   * Migrate all test files or specific files
   */
  public migrate(paths: string[], dryRun: boolean = false): MigrationStats {
    console.log(`🚀 Starting uvu → Bun test migration ${dryRun ? '(DRY RUN)' : ''}`);
    console.log('═'.repeat(60));

    for (const path of paths) {
      const stat = statSync(path);
      
      if (stat.isDirectory()) {
        const testFiles = this.findTestFiles(path);
        console.log(`\n📂 Found ${testFiles.length} test files in ${path}`);
        
        for (const file of testFiles) {
          this.processFile(file, dryRun);
        }
      } else if (path.endsWith('.test.ts')) {
        this.processFile(path, dryRun);
      } else {
        console.log(`⏭️  Skipping non-test file: ${path}`);
      }
    }

    return this.stats;
  }

  /**
   * Print migration statistics
   */
  public printStats(): void {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`📁 Files processed: ${this.stats.filesProcessed}`);
    console.log(`🧪 Tests converted: ${this.stats.testsConverted}`);
    console.log(`🔧 Assertions converted: ${this.stats.assertionsConverted}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`❌ Errors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(error => console.log(`   ${error}`));
    } else {
      console.log(`✅ No errors!`);
    }
    console.log('═'.repeat(60));
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const paths = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  
  if (paths.length === 0) {
    console.log(`
🔄 uvu → Bun Test Migration Tool

Usage:
  ts-node scripts/migrate-uvu-to-bun.ts [OPTIONS] <paths...>

Options:
  --dry-run, -n    Show what would be changed without modifying files

Examples:
  # Migrate all tests (dry run)
  ts-node scripts/migrate-uvu-to-bun.ts --dry-run test/

  # Migrate specific file
  ts-node scripts/migrate-uvu-to-bun.ts test/features/adt.test.ts

  # Migrate all tests in directory
  ts-node scripts/migrate-uvu-to-bun.ts test/language-features/

  # Migrate everything (be careful!)
  ts-node scripts/migrate-uvu-to-bun.ts test/
`);
    process.exit(1);
  }

  const migrator = new UvuToBunMigrator();
  const stats = migrator.migrate(paths, dryRun);
  migrator.printStats();

  if (stats.errors.length > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { UvuToBunMigrator };