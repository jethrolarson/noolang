import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Bridge Tests (LSP Simulation)', () => {
  test('should call the CLI exactly like the LSP Rust bridge does', async () => {
    // Simulate the exact command the Rust LSP bridge executes
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    expect(fs.existsSync(basicNooPath)).toBe(true);

    return new Promise<void>((resolve, reject) => {
      // Simulate: Command::new("node").args(&[&self.cli_path, "--types-file", file_path]).output()
      const child = spawn('node', [
        path.join(__dirname, '..', '..', 'cli.ts'),
        '--types-file',
        basicNooPath
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..', '..', '..')
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        console.log('CLI stdout:', stdout);
        console.log('CLI stderr:', stderr);
        console.log('Exit code:', code);

        if (stderr.includes('Expected KEYWORD \'match\', but got KEYWORD \'implement\' at line 81')) {
          console.log('🎯 REPRODUCED THE EXACT ERROR!');
          console.log('Stderr contains the line 81 error:', stderr);
          reject(new Error(`Reproduced LSP error: ${stderr}`));
        } else if (code !== 0) {
          reject(new Error(`CLI failed with code ${code}: ${stderr}`));
        } else {
          // Success case
          expect(stdout).toContain('Types:');
          resolve();
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  });

  test('should call CLI with ts-node like npm start does', () => {
    // Test with ts-node (like npm start) vs direct node
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    
    try {
      const result = execSync(`npx ts-node src/cli.ts --types-file ${basicNooPath}`, {
        cwd: path.join(__dirname, '..', '..', '..'),
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      console.log('ts-node result:', result);
      expect(result).toContain('Types:');
    } catch (error: any) {
      console.log('ts-node error:', error.message);
      console.log('ts-node stderr:', error.stderr);
      
      if (error.stderr?.includes('line 81') || error.message?.includes('Expected KEYWORD \'match\'')) {
        console.log('🎯 REPRODUCED ERROR WITH TS-NODE!');
      }
      
      throw error;
    }
  });

  test('should check if LSP server can find the CLI', () => {
    // Test the CLI path resolution that the LSP uses
    const possiblePaths = [
      '../dist/cli.js',           // From lsp/ directory to workspace root
      'dist/cli.js',              // From workspace root
      '../../dist/cli.js',        // From nested directories
      './dist/cli.js',            // Explicit relative path
    ];
    
    const workspaceRoot = path.join(__dirname, '..', '..', '..');
    console.log('Workspace root:', workspaceRoot);
    
    for (const cliPath of possiblePaths) {
      const fullPath = path.resolve(workspaceRoot, cliPath);
      console.log(`Checking CLI path: ${fullPath} - exists: ${fs.existsSync(fullPath)}`);
    }
    
    // The LSP should be able to find a CLI
    const hasValidCli = possiblePaths.some(p => 
      fs.existsSync(path.resolve(workspaceRoot, p))
    );
    
    if (!hasValidCli) {
      console.log('⚠️  No built CLI found - LSP might be using ts-node or failing');
    }
    
    // This test is informational
    expect(true).toBe(true);
  });

  test('should test working directory impact', () => {
    // Test if the working directory affects the error
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    
    // Test from workspace root
    try {
      const result1 = execSync(`npx ts-node src/cli.ts --types-file ${basicNooPath}`, {
        cwd: path.join(__dirname, '..', '..', '..'),
        encoding: 'utf8'
      });
      console.log('From workspace root - success');
    } catch (error: any) {
      console.log('From workspace root - error:', error.message);
    }
    
    // Test from lsp directory (where LSP server runs)
    try {
      const result2 = execSync(`npx ts-node ../src/cli.ts --types-file ../examples/basic.noo`, {
        cwd: path.join(__dirname, '..', '..', '..', 'lsp'),
        encoding: 'utf8'
      });
      console.log('From lsp directory - success');
    } catch (error: any) {
      console.log('From lsp directory - error:', error.message);
      if (error.stderr?.includes('line 81')) {
        console.log('🎯 FOUND IT! Working directory matters!');
      }
    }
    
    expect(true).toBe(true);
  });
});