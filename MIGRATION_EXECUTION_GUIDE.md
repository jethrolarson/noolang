# Jest to uvu Migration - Execution Guide

## 🚀 Ready to Execute

You now have everything needed for a full migration from Jest to uvu with a **3x performance improvement**!

## 📋 Pre-Migration Checklist

- [x] **POC Completed**: `test/type-system/adt_limitations.uvu.ts` shows 3.17x speedup
- [x] **Dependencies Installed**: uvu, c8, tsx added to package.json
- [x] **Migration Script**: `scripts/migrate-to-uvu.js` ready
- [x] **Test Utilities**: `test/utils.uvu.ts` for helpers
- [x] **Scripts Updated**: npm scripts for uvu testing
- [x] **Documentation**: Complete migration plan and patterns

## 🎯 Execute the Migration

### Step 1: Start with Batch 1 (Simplest Tests) - 30 minutes
```bash
# Migrate the easiest tests first
node scripts/migrate-to-uvu.js --batch=1

# Review and fix any issues
npm run test:uvu

# Compare performance
time npm run test:uvu
time npx jest test/language-features/record_tuple_unit.test.ts test/language-features/tuple.test.ts test/type-system/print_type_pollution.test.ts test/type-system/option_unification.test.ts
```

**Expected files**:
- `test/language-features/record_tuple_unit.uvu.ts` (44 lines)
- `test/language-features/tuple.uvu.ts` (72 lines)
- `test/type-system/print_type_pollution.uvu.ts` (120 lines)
- `test/type-system/option_unification.uvu.ts` (97 lines)

### Step 2: Migrate Batch 2 (Medium Complexity) - 45 minutes
```bash
node scripts/migrate-to-uvu.js --batch=2
npm run test:uvu
```

**Expected files**:
- `test/language-features/closure.uvu.ts` (83 lines)
- `test/language-features/head_function.uvu.ts` (96 lines)
- `test/integration/import_relative.uvu.ts` (93 lines)

### Step 3: Migrate Batch 3 (Complex Tests) - 60 minutes
```bash
node scripts/migrate-to-uvu.js --batch=3
# Manual review likely needed for these files
npm run test:uvu
```

### Step 4: Migrate Batch 4 (Large Files) - 90 minutes
```bash
node scripts/migrate-to-uvu.js --batch=4
# These are the biggest files, expect manual work
npm run test:uvu
```

### Step 5: Full Migration Validation - 30 minutes
```bash
# Test everything
npm run test:uvu:coverage

# Performance comparison
time npm test  # Jest
time npm run test:uvu  # uvu

# Update main test script
npm pkg set scripts.test="uvu test --require tsx/cjs"
```

## 🔧 Manual Fixes You'll Need

### 1. Nested describe blocks
The script flattens these, but you may need to clean up extra closing braces:
```typescript
// Remove extra closing braces from old describe blocks
});  // ← Remove these
```

### 2. beforeEach patterns
```typescript
// AUTOMATIC: Script converts to:
const setup = () => {
  // setup code
};

// MANUAL: Update tests to use setup:
test('my test', () => {
  const data = setup();
  // test code
});
```

### 3. Complex expectations
```typescript
// May need manual conversion:
expect(result).toEqual(expect.objectContaining({...}))
// →
assert.ok(result.hasOwnProperty('expectedProp'));
```

## 📊 Expected Performance Gains

Based on POC results:

| Metric | Jest | uvu | Improvement |
|--------|------|-----|-------------|
| Single test file | 828ms | 261ms | **3.17x faster** |
| Full test suite | ~15s | ~5s | **3x faster** |
| CI/CD time | 2-3 min | <1 min | **60-70% reduction** |

## 🚨 Common Issues & Solutions

### Issue: "Cannot find module 'tsx/cjs'"
```bash
npm install --save-dev tsx
```

### Issue: "ReferenceError: test is not defined"
Add to file:
```typescript
import { test } from 'uvu';
import * as assert from 'uvu/assert';
```

### Issue: Tests fail with "assert.equal" differences
Use our helper:
```typescript
import { assertDeepEqual } from '../utils.uvu';
assertDeepEqual(actual, expected);
```

### Issue: uvu doesn't find test files
Check pattern in uvu call:
```bash
uvu test --require tsx/cjs  # Finds all .ts files in test/
uvu test/specific --require tsx/cjs  # Specific directory
```

## 🎉 Success Validation

After migration, you should see:

1. **All tests passing**: `npm run test:uvu` shows green
2. **Coverage maintained**: `npm run test:uvu:coverage` shows similar coverage
3. **Performance improvement**: `time npm run test:uvu` shows 3x speedup
4. **CI working**: Tests run faster in CI/CD

## 🧹 Cleanup After Success

```bash
# Remove Jest dependencies
npm uninstall jest @types/jest ts-jest @swc/jest

# Remove Jest config files
rm jest.config.cjs jest.config.swc.cjs

# Remove original test files (after verifying uvu tests work)
find test -name "*.test.ts" -delete

# Update CI/CD config to use uvu
# Update documentation
```

## 🔄 Rollback Plan (if needed)

If issues arise:
1. Keep original `.test.ts` files until fully validated
2. Jest dependencies are still installed
3. Original Jest scripts still work
4. Simply delete `.uvu.ts` files to revert

## 🚀 Start Now

```bash
# Begin migration with simplest batch
node scripts/migrate-to-uvu.js --batch=1

# See immediate results
npm run test:uvu
```

**Total estimated time**: 4-6 hours for complete migration
**Payoff**: 3x faster tests forever, faster CI/CD, better developer experience