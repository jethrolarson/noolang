# Jest to uvu Migration Proof of Concept

## Overview

This POC demonstrates migrating from Jest to uvu + c8 for testing in the Noolang project. We migrated the `test/type-system/adt_limitations.test.ts` file (216 lines) to compare performance and developer experience.

## Files Created/Modified

### New Files
- `test/type-system/adt_limitations.uvu.ts` - Migrated test file using uvu
- `uvu.config.js` - uvu configuration file  
- `benchmark-test-runners.js` - Performance comparison script
- `JEST_TO_UVU_POC.md` - This summary document

### Modified Files
- `package.json` - Added uvu and c8 dependencies and scripts

## Performance Results

### Single Run Comparison
- **Jest**: 807ms
- **uvu**: 248ms
- **Speedup**: 3.25x faster with uvu

### Average Performance (3 runs)
- **Jest avg**: 828ms
- **uvu avg**: 261ms
- **Avg speedup**: 3.17x faster with uvu

## Package Size Comparison
- **Jest**: 36K (main package, but has many dependencies)
- **uvu**: 684K 
- **c8**: 1.5M

Note: While uvu + c8 appear larger individually, Jest has a much larger dependency tree overall.

## API Differences

### Jest Syntax
```typescript
import { describe, it, expect } from '@jest/globals';

describe('ADT Language Limitations', () => {
  describe('Multiple ADT Definitions', () => {
    it('should work with separate type definitions', () => {
      expect(result.finalValue).toEqual(expectedValue);
    });
  });
});
```

### uvu Syntax
```typescript
import { test } from 'uvu';
import * as assert from 'uvu/assert';

test('should work with separate type definitions', () => {
  assert.equal(result.finalValue, expectedValue);
});

test.run();
```

## Key Differences

### Advantages of uvu
1. **Performance**: ~3x faster execution
2. **Simpler API**: Less nested structure, more straightforward
3. **Smaller runtime**: Lighter weight test runner
4. **ESM support**: Better modern JavaScript support
5. **Parallel by default**: Built-in parallelization

### Advantages of Jest
1. **Ecosystem**: Larger community and plugin ecosystem
2. **IDE integration**: Better tooling support
3. **Snapshot testing**: Built-in snapshot capabilities
4. **Mocking**: More sophisticated mocking capabilities
5. **Watch mode**: More advanced file watching

## Migration Process

### 1. Install Dependencies
```bash
npm install --save-dev uvu c8 tsx
```

### 2. Convert Test Syntax
- Replace `describe`/`it` with `test`
- Replace `expect` with `assert`
- Add `test.run()` at the end
- Remove nested describe blocks (flatten structure)

### 3. Update Scripts
```json
{
  "test:uvu": "uvu test/type-system adt_limitations.uvu.ts --require tsx/cjs",
  "test:uvu:coverage": "c8 --reporter=text --reporter=html uvu test/type-system adt_limitations.uvu.ts --require tsx/cjs"
}
```

## Coverage Comparison

Both tools provide good coverage reporting:

### Jest Coverage
Uses built-in coverage with Istanbul

### c8 Coverage  
Uses V8's built-in coverage (more accurate)
- Text and HTML reports
- 59.93% statement coverage on test run
- More granular line-by-line coverage

## Recommendations

### Use uvu when:
- Performance is critical
- You prefer simpler, flatter test structure
- You want faster CI/CD pipelines
- You're building ESM-first applications

### Stick with Jest when:
- You need extensive mocking capabilities
- You rely heavily on snapshot testing
- You need the broader ecosystem and tooling
- Team is already familiar with Jest patterns

## Commands to Run POC

```bash
# Run original Jest test
npx jest test/type-system/adt_limitations.test.ts --verbose

# Run migrated uvu test
npm run test:uvu

# Run with coverage
npm run test:uvu:coverage

# Run performance benchmark
node benchmark-test-runners.js
```

## Conclusion

uvu shows significant performance improvements (3x faster) with a simpler API, making it an attractive alternative for performance-sensitive projects. However, Jest's ecosystem and tooling advantages may outweigh the performance benefits for larger teams or projects requiring extensive testing features.

The migration is straightforward for most test cases, but complex mocking scenarios may require additional work.