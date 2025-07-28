# Automated Example Testing Plan

## Current Status

As of the documentation review (December 2024), we have identified that **6 out of 12** example files work correctly, while **6 have known issues** due to type system limitations documented in `LANGUAGE_WEAKNESSES.md`.

## Immediate Implementation (✅ Done)

### CI Integration
- Added `example-validation` job to GitHub Actions CI
- **Non-blocking**: Uses `continue-on-error: true` so it doesn't fail the entire pipeline
- **Informational**: Provides warnings about regressions without blocking development
- Validates both working examples and monitors broken examples

### Current Validation
```bash
# Working examples (should pass)
- basic.noo
- adt_demo.noo  
- safe_thrush_demo.noo
- simple_adt.noo
- minimal_trait_test.noo
- math_functions.noo

# Known broken examples (expected to fail)
- demo.noo
- type_system_demo.noo
- constraints_demo.noo
- trait_system_demo.noo
- generic_safe_thrush_demo.noo
- trait_truly_multiline_demo.noo
```

## Phase 1: Post-Type-System-Fixes (High Priority)

Once the critical type system issues are resolved:

### 1. Enable Strict Example Validation
```yaml
# Remove continue-on-error and make examples a hard requirement
example-validation:
  runs-on: ubuntu-latest
  needs: [typescript-check, core-tests]
  # continue-on-error: true  # Remove this line
```

### 2. Add Example Output Validation
```bash
# Not just "does it run" but "does it produce expected output"
npm start examples/basic.noo > output.txt
diff output.txt expected-outputs/basic.expected
```

### 3. Performance Regression Detection
```bash
# Track example execution performance
npm start examples/demo.noo --performance > perf.json
# Compare against baseline performance
```

## Phase 2: Enhanced Testing Infrastructure (Medium Priority)

### 1. Example Test Framework
Create `scripts/test-examples.js`:
```javascript
// Structured testing with expected outputs, performance baselines, etc.
const examples = [
  {
    file: 'basic.noo',
    expectedOutput: /\{@result 14; @doubled 20;/,
    maxExecutionTime: 500, // ms
    shouldPass: true
  },
  // ...
];
```

### 2. Documentation Synchronization
```bash
# Ensure README examples match actual working examples
# Extract code blocks from README.md and validate them
```

### 3. Example Categories
```
examples/
├── working/          # Examples that should always pass
├── showcase/         # Complex examples demonstrating features  
├── benchmarks/       # Performance-focused examples
├── regression/       # Examples that test specific bug fixes
└── documentation/    # Examples used in README/docs
```

## Phase 3: Advanced Validation (Lower Priority)

### 1. Type Annotation Validation
```bash
# Ensure type annotations in examples are accurate
npm start examples/demo.noo --types-detailed | validate-types.js
```

### 2. Cross-Platform Testing
```yaml
# Test examples on different platforms
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
```

### 3. Integration with VSCode Extension
```bash
# Test examples work with LSP/syntax highlighting
code --extensionDevelopmentPath=. examples/basic.noo
```

## Automation Benefits

### For Developers
- **Catch regressions early**: Know immediately if changes break examples
- **Confidence in changes**: Safe to refactor knowing examples are validated
- **Performance monitoring**: Track if changes slow down execution

### For Users
- **Reliable documentation**: Examples in docs are guaranteed to work
- **Up-to-date showcases**: Examples reflect current language capabilities
- **Clear error messages**: When examples fail, get specific guidance

### For Language Development
- **Feature validation**: New language features must work in examples
- **Breaking change detection**: Know when changes affect user-facing code
- **Quality gate**: Examples become part of the definition of "ready to release"

## Implementation Timeline

### Immediate (✅ Done)
- [x] Basic CI integration with non-blocking validation
- [x] Working/broken example categorization
- [x] Informational reporting in CI

### After Type System Fixes (High Priority)
- [ ] Enable strict validation (remove `continue-on-error`)
- [ ] Add expected output validation
- [ ] Performance regression detection
- [ ] Update broken examples to work

### Enhanced Infrastructure (Medium Priority)  
- [ ] Structured test framework
- [ ] Documentation synchronization
- [ ] Example categorization and reorganization

### Advanced Features (Lower Priority)
- [ ] Type annotation validation
- [ ] Cross-platform testing
- [ ] LSP integration testing

## Success Metrics

1. **Coverage**: All examples in `examples/` directory pass validation
2. **Documentation**: All code examples in README.md work correctly
3. **Performance**: Example execution time within acceptable bounds
4. **Reliability**: CI catches example regressions before merge
5. **User Experience**: Users can copy-paste any example and have it work

## Current Blockers

The main blockers for full automated example testing are the type system issues documented in `LANGUAGE_WEAKNESSES.md`:

1. **Generic ADT Constructor Issues** - Prevents `demo.noo` from working
2. **Trait Function Constraint Resolution** - Affects multiple examples
3. **Pipeline Operator Confusion** - Requires syntax clarification

Once these are resolved, we can move from "informational" to "strict" example validation, making working examples a hard requirement for CI success.

## Migration Strategy

```bash
# Phase 1: Fix core issues, move examples from broken/ to working/
git mv examples/demo.noo examples/working/demo.noo

# Phase 2: Update CI to require all working examples to pass
# Remove continue-on-error from CI configuration

# Phase 3: Add new examples with strict validation from day 1
# New examples must include expected output and performance baseline
```

This approach ensures we can start getting value from example testing immediately while building toward a comprehensive validation system as the language matures.