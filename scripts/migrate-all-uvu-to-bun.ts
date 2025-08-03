#!/usr/bin/env ts-node

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { UvuToBunMigrator } from './migrate-uvu-to-bun-fixed';

interface MigrationReport {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  totalTests: number;
  totalAssertions: number;
  errors: string[];
  processedPaths: string[];
}

class FullMigrator {
  private migrator = new UvuToBunMigrator();
  private report: MigrationReport = {
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    totalTests: 0,
    totalAssertions: 0,
    errors: [],
    processedPaths: []
  };

  /**
   * Find all test files recursively
   */
  private findTestFiles(dir: string, testFiles: string[] = []): string[] {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .git directories
        if (entry !== 'node_modules' && entry !== '.git' && entry !== '.bun') {
          this.findTestFiles(fullPath, testFiles);
        }
      } else if (stat.isFile() && fullPath.endsWith('.test.ts')) {
        testFiles.push(fullPath);
        this.report.totalFiles++;
      }
    }
    
    return testFiles;
  }

  /**
   * Migrate all test files
   */
  public async migrate(dryRun: boolean = false): Promise<MigrationReport> {
    console.log('🔍 Finding test files...');
    const testFiles = this.findTestFiles('.');
    
    console.log(`📋 Found ${testFiles.length} test files`);
    
    if (dryRun) {
      console.log('🧪 Running in DRY RUN mode - no files will be modified');
    }
    
    console.log('\n📝 Processing files:');
    
    for (const filePath of testFiles) {
      process.stdout.write(`   ${filePath}... `);
      
      const success = this.migrator.processFile(filePath, dryRun);
      
      if (success) {
        console.log('✅ converted');
        this.report.processedFiles++;
        this.report.processedPaths.push(filePath);
      } else {
        console.log('⏭️ skipped (not uvu)');
        this.report.skippedFiles++;
      }
    }
    
    // Aggregate stats
    const stats = this.migrator.getStats();
    this.report.totalTests = stats.testsConverted;
    this.report.totalAssertions = stats.assertionsConverted;
    this.report.errors = stats.errors;
    
    return this.report;
  }

  /**
   * Print migration summary
   */
  public printSummary(report: MigrationReport, dryRun: boolean): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`📁 Total files found: ${report.totalFiles}`);
    console.log(`✅ Files ${dryRun ? 'would be ' : ''}processed: ${report.processedFiles}`);
    console.log(`⏭️ Files skipped: ${report.skippedFiles}`);
    console.log(`🧪 Tests ${dryRun ? 'would be ' : ''}converted: ${report.totalTests}`);
    console.log(`🎯 Assertions ${dryRun ? 'would be ' : ''}converted: ${report.totalAssertions}`);
    
    if (report.errors.length > 0) {
      console.log(`❌ Errors encountered: ${report.errors.length}`);
      report.errors.forEach(error => console.log(`   ${error}`));
    } else {
      console.log('✅ No errors encountered');
    }
    
    if (report.processedFiles > 0) {
      console.log('\n📝 Processed files:');
      report.processedPaths.forEach(path => console.log(`   ${path}`));
      
      if (!dryRun) {
        console.log('\n💾 Backup files created with .uvu.bak extension');
        console.log('🧪 Run `bun test` to verify the migration');
      }
    }
    
    console.log('='.repeat(60));
  }
}

// Main execution
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const fullMigrator = new FullMigrator();
  
  (async () => {
    try {
      const report = await fullMigrator.migrate(dryRun);
      fullMigrator.printSummary(report, dryRun);
      
      if (report.errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  })();
}

export { FullMigrator };