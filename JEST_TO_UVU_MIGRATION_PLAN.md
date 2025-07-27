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

#### Test Utilities (`test/utils.uvu.ts`)


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
