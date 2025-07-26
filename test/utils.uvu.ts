import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Re-export for convenience
export { test, assert };

// Custom assertion helpers for common patterns
export const assertDeepEqual = (actual: any, expected: any, message?: string) => {
  try {
    assert.equal(actual, expected, message);
  } catch (error) {
    // If regular equality fails, try JSON comparison for deep objects
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
  }
};

// Helper for object property testing
export const assertHasProperty = (obj: any, prop: string, message?: string) => {
  assert.ok(Object.prototype.hasOwnProperty.call(obj, prop), message || `Expected object to have property: ${prop}`);
};

// Helper for array/string contains testing  
export const assertContains = (container: any, item: any, message?: string) => {
  if (typeof container === 'string') {
    assert.ok(container.includes(item), message || `Expected "${container}" to contain "${item}"`);
  } else if (Array.isArray(container)) {
    assert.ok(container.includes(item), message || `Expected array to contain item`);
  } else {
    throw new Error('assertContains requires string or array');
  }
};

// Helper for regex matching
export const assertMatches = (actual: string, pattern: RegExp, message?: string) => {
  assert.match(actual, pattern, message);
};

// Helper for function throwing
export const assertThrows = (fn: () => any, message?: string) => {
  assert.throws(fn, message);
};

export const assertNotThrows = (fn: () => any, message?: string) => {
  assert.not.throws(fn, message);
};

// Helper to create test setup/teardown pattern
export const withSetup = <T>(
  setupFn: () => T,
  teardownFn?: (data: T) => void
) => {
  return (testFn: (data: T) => void) => {
    const data = setupFn();
    try {
      testFn(data);
    } finally {
      if (teardownFn) {
        teardownFn(data);
      }
    }
  };
};

// Helper for beforeEach-style setup
export const createTestContext = <T>(setupFn: () => T) => {
  return () => setupFn();
};

// Common Noolang test utilities
export const runNoolang = (source: string) => {
  // This will be imported from actual test files that need it
  throw new Error('runNoolang should be implemented in individual test files');
};

// Test file structure helpers
export const createTestSuite = (suiteName: string) => {
  console.log(`\n🧪 Running ${suiteName} tests`);
  return {
    name: suiteName,
    beforeAll: (fn: () => void) => fn(), // Execute immediately for now
    afterAll: (fn: () => void) => {
      // Store for execution after tests (basic implementation)
      process.on('exit', fn);
    }
  };
};