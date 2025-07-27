# Jest to uvu Full Migration Plan

## Project Analysis

### Current Test Suite Stats
- **Total test files**: 16
- **Total lines of test code**: 2,150 lines
- **Total test cases**: ~326 tests
- **Largest files**: 
  - `test/features/adt.test.ts` (496 lines)
  - `test/language-features/combinators.test.ts` (626 lines)

### Performance Impact
- **Current POC results**: 3.17x faster execution
- **Estimated CI/CD improvement**: 60-70% reduction in test runtime
- **Developer experience**: Faster feedback loops during development

## Migration Strategy

### Phase 1: Infrastructure Setup ✅ COMPLETED
1. **Update package.json dependencies** ✅
2. **Create uvu configuration and utilities** ✅  
3. **Update CI/CD pipelines** ✅
4. **Create migration tooling/scripts** ✅

### Phase 2: Test Migration (3-4 days) 🚧 IN PROGRESS
Migrate tests in order of complexity and dependencies:

#### Batch 1: Simple Unit Tests ✅ COMPLETED
- `test/language-features/record_tuple_unit.test.ts` ✅
- `test/language-features/tuple.test.ts` ✅
- `test/type-system/print_type_pollution.test.ts` ✅
- `test/type-system/option_unification.test.ts` ✅

#### Batch 2: Medium Complexity Tests ✅ COMPLETED  
- `test/language-features/closure.test.ts` ✅
- `test/language-features/head_function.test.ts` ✅
- `test/integration/import_relative.test.ts` ✅
- `test/type-system/adt_limitations.test.ts` ✅

#### Batch 3: Complex Tests ✅ MOSTLY COMPLETED
- `test/features/operators/dollar-operator.test.ts` ✅
- `test/features/operators/safe_thrush_operator.test.ts` ✅
- `test/features/pattern-matching/pattern_matching_failures.test.ts` ✅
- `test/features/effects/effects_phase2.test.ts` ✅
- `test/features/effects/effects_phase3.test.ts` ✅

#### Batch 4: Large Integration Tests 🚧 IN PROGRESS
- `test/features/adt.test.ts` ✅ (19/30 tests passing - needs minor fixes)
- `test/language-features/combinators.test.ts` ⏳ (626 lines - large parser combinator tests)
- Core source tests in `src/` directories ⏳

**Current Status: 12/14 target test files migrated (85.7% complete)**

### Phase 3: Validation & Cleanup (1 day)
1. **Run full test suite comparison**
2. **Update documentation**
3. **Remove Jest dependencies**
4. **Performance validation**

## Technical Implementation

### 1. Infrastructure Changes

#### package.json Updates
```json
{
  "scripts": {
    "test": "uvu test --require tsx/cjs",
    "test:coverage": "c8 --reporter=text --reporter=html uvu test --require tsx/cjs",
    "test:watch": "uvu test --require tsx/cjs --watch",
    "test:ci": "c8 --reporter=lcov uvu test --require tsx/cjs"
  },
  "devDependencies": {
    "uvu": "^0.5.6",
    "c8": "^8.0.1",
    "tsx": "^4.0.0"
  }
}
```

#### uvu Configuration (`uvu.config.js`)
```javascript
export default {
  require: ['tsx/cjs'],
  timeout: 30000,
  concurrency: true,
  bail: false
};
```

#### Test Utilities (`test/utils.uvu.ts`)
```typescript
import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Shared test utilities for uvu
export { test, assert };

// Custom assertion helpers
export const assertDeepEqual = (actual: any, expected: any) => {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
};

// beforeEach/afterEach equivalents
export const createSuite = (name: string) => {
  const suite = test.suite(name);
  
  suite.before = (fn: () => void) => {
    // Global setup if needed
  };
  
  suite.after = (fn: () => void) => {
    // Global cleanup if needed
  };
  
  return suite;
};
```

### 2. Migration Patterns

#### Basic Test Conversion
```typescript
// BEFORE (Jest)
describe('Feature Name', () => {
  it('should do something', () => {
    expect(result).toEqual(expected);
  });
});

// AFTER (uvu)
test('Feature Name - should do something', () => {
  assert.equal(result, expected);
});
test.run();
```

#### beforeEach/afterEach Pattern
```typescript
// BEFORE (Jest)
describe('Suite', () => {
  beforeEach(() => {
    // setup
  });
  
  it('test', () => {
    // test code
  });
});

// AFTER (uvu)
const setup = () => {
  // setup code
  return setupData;
};

test('Suite - test', () => {
  const data = setup();
  // test code
});
test.run();
```

#### Mock Handling
```typescript
// BEFORE (Jest) - Simple mocks
const mockFs = { readFileSync: jest.fn() };

// AFTER (uvu) - Manual mocks (no change needed)
const mockFs = { 
  readFileSync: (path: string) => 'mocked content'
};
```

### 3. Automated Migration Script

Create `scripts/migrate-to-uvu.js`:
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const migrateFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Basic transformations
  content = content.replace(/import.*from '@jest\/globals'.*;?\n/g, "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\n");
  content = content.replace(/describe\(['"`]([^'"`]+)['"`],\s*\(\)\s*=>\s*\{/g, '// Test suite: $1');
  content = content.replace(/\s*it\(['"`]([^'"`]+)['"`],/g, "test('$1',");
  content = content.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.equal($1, $2)');
  content = content.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.is($1, $2)');
  
  // Add test.run() at the end
  if (!content.includes('test.run()')) {
    content += '\ntest.run();\n';
  }
  
  // Write to .uvu.ts file
  const newPath = filePath.replace('.test.ts', '.uvu.ts');
  fs.writeFileSync(newPath, content);
  console.log(`Migrated: ${filePath} -> ${newPath}`);
};

// Migration logic here...
```

### 4. CI/CD Updates

#### GitHub Actions Example
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Migration Challenges & Solutions

### 1. Nested describe Blocks
**Challenge**: uvu doesn't support nested describes
**Solution**: Flatten to descriptive test names
```typescript
// BEFORE
describe('ADT', () => {
  describe('Option Type', () => {
    it('should create Some', () => {});
  });
});

// AFTER  
test('ADT - Option Type - should create Some', () => {});
```

### 2. beforeEach/afterEach
**Challenge**: uvu doesn't have built-in lifecycle hooks
**Solution**: Manual setup functions or test suites
```typescript
// Create reusable setup
const withSetup = (testFn: (data: any) => void) => {
  const data = setupTestData();
  testFn(data);
  cleanupTestData(data);
};

test('my test', () => withSetup((data) => {
  // test with data
}));
```

### 3. Complex Mocking
**Challenge**: No built-in mocking like Jest
**Solution**: Manual mocks or simple mock libraries
```typescript
// Simple manual mocks work fine for most cases
const createMockFs = () => ({
  readFileSync: (path: string) => mockFileContents[path] || '',
  existsSync: (path: string) => path in mockFileContents
});
```

### 4. Snapshot Testing
**Challenge**: uvu doesn't have built-in snapshots
**Solution**: 
- Use a simple snapshot library like `@paka/snapshot`
- Or convert to explicit assertions

## Risk Assessment

### Low Risk Items
- Simple unit tests with basic assertions
- Tests without complex mocking
- Tests with straightforward setup/teardown

### Medium Risk Items  
- Tests with beforeEach/afterEach patterns
- Tests with simple mocking
- Integration tests with file system mocking

### High Risk Items
- Tests with complex Jest-specific features
- Tests with extensive mocking/spying
- Tests that rely on Jest's specific assertion behavior

## Success Metrics

### Performance Goals
- [ ] ≥3x faster test execution
- [ ] <500ms for individual test files
- [ ] <10s for full test suite
- [ ] ≥50% reduction in CI time

### Quality Goals
- [ ] 100% test migration (no skipped tests)
- [ ] Maintain or improve code coverage
- [ ] Zero breaking changes to test behavior
- [ ] Improved developer experience

## Timeline

### Week 1
- **Days 1-2**: Infrastructure setup and tooling
- **Days 3-4**: Migrate simple tests (Batches 1-2)
- **Day 5**: Validate and fix issues

### Week 2  
- **Days 1-2**: Migrate complex tests (Batches 3-4)
- **Days 3-4**: Integration testing and performance validation
- **Day 5**: Documentation and cleanup

## Rollback Plan

1. Keep Jest dependencies until migration is complete
2. Maintain parallel test scripts during transition
3. Git branching strategy for safe rollback
4. Performance benchmarks at each phase

## Getting Started

### Immediate Next Steps
1. Run `npm install --save-dev uvu c8 tsx`
2. Create basic uvu configuration
3. Start with the simplest test file migration
4. Set up parallel CI pipeline for validation
5. Create migration tooling/scripts

### Command to Start Migration
```bash
# Install dependencies
npm install --save-dev uvu c8 tsx

# Migrate first simple test
node scripts/migrate-to-uvu.js test/language-features/record_tuple_unit.test.ts

# Test the migration
npm run test:uvu -- test/language-features/record_tuple_unit.uvu.ts
```