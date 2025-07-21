# REPL Automated Testing

This document describes the comprehensive automated testing system for the Noolang REPL (Read-Eval-Print Loop).

## Overview

The REPL testing system consists of three main components:

1. **Unit Tests** (`test/repl.test.ts`) - Fast, isolated tests using mocked components
2. **Integration Tests** (`test/repl-integration.test.ts`) - End-to-end tests with real REPL processes
3. **Automation Scripts** (`scripts/test-repl-automation.ts`) - Comprehensive scenario testing

## Running Tests

### Quick Start

```bash
# Run all REPL-related tests
npm run test:all-repl

# Run individual test suites
npm run test:repl              # Unit tests only
npm run test:repl-integration  # Integration tests only
npm run test:repl-automation   # Automation scenarios
```

### Individual Test Categories

```bash
# Unit tests - fast execution, mocked dependencies
npm run test:repl

# Integration tests - real REPL processes
npm run test:repl-integration

# Full automation suite with comprehensive scenarios
npm run test:repl-automation
```

## Test Categories

### 1. Unit Tests (`test/repl.test.ts`)

**Purpose**: Fast, isolated testing of REPL functionality without spawning processes.

**Coverage**:
- Basic expression evaluation (arithmetic, strings, booleans, lists)
- State persistence between inputs
- Error handling and recovery
- REPL command processing
- Type system integration
- Complex interactive scenarios
- Performance and edge cases

**Key Features**:
- Mocked `readline` interface
- Captured console output for assertions
- `TestableREPL` class exposing private methods
- No external process dependencies

**Example Test**:
```typescript
test('should maintain variable definitions between inputs', () => {
  repl.testProcessInput('x = 42');
  logOutput = [];
  repl.testProcessInput('x + 8');
  
  expect(logOutput.some(line => line.includes('50'))).toBe(true);
});
```

### 2. Integration Tests (`test/repl-integration.test.ts`)

**Purpose**: End-to-end testing with real REPL processes to ensure actual user experience works.

**Coverage**:
- REPL startup and initialization
- Real inter-process communication
- Command-line interface testing
- Cross-platform compatibility
- Process lifecycle management

**Key Features**:
- Spawns actual `ts-node src/repl.ts` processes
- Tests real stdin/stdout interaction
- Validates complete user workflow
- Includes timeout and cleanup handling

**Example Test**:
```typescript
test('should evaluate simple expressions interactively', async () => {
  await startREPL();
  
  const response1 = await sendInput('1 + 2');
  expect(response1).toContain('3');
  
  const response2 = await sendInput('"hello world"');
  expect(response2).toContain('hello world');
});
```

### 3. Automation Scripts (`scripts/test-repl-automation.ts`)

**Purpose**: Comprehensive scenario testing with detailed reporting and CI/CD integration.

**Coverage**:
- Predefined test scenarios covering common use cases
- Performance benchmarking
- Detailed test reporting with JSON output
- Command-line execution for CI/CD

**Key Features**:
- `REPLTestAutomator` class for systematic testing
- Configurable test scenarios with validation rules
- Comprehensive console output and logging
- JSON test reports for analysis
- Graceful error handling and cleanup

**Test Scenarios**:
1. **Basic Arithmetic** - Simple math operations
2. **String Operations** - String literals and concatenation
3. **Variable Definitions and Usage** - State persistence
4. **Function Definitions and Applications** - Higher-order functions
5. **List Operations** - Array manipulation
6. **REPL Commands** - Debug and utility commands
7. **Error Handling** - Graceful error recovery
8. **Type Polymorphism** - Generic function usage
9. **Complex Expressions** - Recursive functions, composition
10. **Debugging Commands** - AST, tokens, environment inspection

## Test Scenarios Detail

### Basic Arithmetic
```javascript
inputs: ['1 + 2', '10 * 5', '100 / 4']
expectedOutputs: ['3', '50', '25']
shouldContainInOutput: ['Int']
```

### Function Composition
```javascript
inputs: [
  'compose = fn f g => fn x => f (g x)',
  'double = fn x => x * 2',
  'increment = fn x => x + 1',
  '(compose double increment) 5'
]
expectedOutputs: ['', '', '', '12']
```

### Error Recovery
```javascript
inputs: ['1 + "hello"', '2 + 3']
expectedOutputs: ['', '5']
shouldContainInOutput: ['Error', '5']
```

## Continuous Integration

The project includes GitHub Actions workflows for automated testing:

### Workflow Jobs

1. **repl-unit-tests** - Fast unit test execution
2. **repl-automation-tests** - Comprehensive scenario testing
3. **repl-integration-tests** - End-to-end validation
4. **repl-cross-platform** - Multi-OS and Node.js version testing
5. **performance-tests** - Performance benchmarking

### Triggering Conditions

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main`
- Changes to REPL-related files:
  - `src/repl.ts`
  - `src/evaluator.ts`
  - `src/typer/**`
  - `test/repl*.test.ts`
  - `scripts/test-repl-automation.ts`

## Writing New Tests

### Adding Unit Tests

1. Add test cases to `test/repl.test.ts`
2. Use the `TestableREPL` class to access private methods
3. Mock console output and capture for assertions
4. Group related tests in `describe` blocks

### Adding Integration Tests

1. Add test cases to `test/repl-integration.test.ts`
2. Use `startREPL()` and `sendInput()` helpers
3. Include proper cleanup in `afterEach`
4. Set appropriate timeouts for process operations

### Adding Automation Scenarios

1. Add new scenarios to the `scenarios` array in `scripts/test-repl-automation.ts`
2. Define inputs, expected outputs, and validation rules
3. Test the scenario with `npm run test:repl-automation`

### Example New Scenario

```typescript
{
  name: 'Pattern Matching',
  inputs: [
    'matchOpt = fn opt => match opt with | Some x => x | None => 0',
    'matchOpt (Some 42)',
    'matchOpt None'
  ],
  expectedOutputs: ['', '42', '0'],
  shouldContainInOutput: ['Some', 'None']
}
```

## Test Reports

### Automation Reports

The automation script generates detailed JSON reports:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "summary": {
    "passed": 8,
    "total": 10,
    "success_rate": 80
  },
  "results": [
    {
      "scenario": "Basic Arithmetic",
      "passed": true,
      "errors": []
    }
  ]
}
```

Reports are saved to `test-reports/repl-automation-report.json`.

### CI Artifacts

GitHub Actions automatically uploads:
- Test result files
- Coverage reports
- Automation reports
- Performance benchmarks

## Performance Testing

### Automated Performance Tests

The system includes performance benchmarking:

```bash
# Run performance tests in CI
npm run test:repl-automation
```

Performance metrics tracked:
- Command response time
- Memory usage during operation
- Startup time
- Concurrent operation handling

### Manual Performance Testing

```bash
# Start REPL and monitor performance
npm run dev

# In another terminal, monitor memory
ps aux | grep repl
top -p $(pgrep -f "repl.ts")
```

## Debugging Test Failures

### Common Issues

1. **Timeout Errors**: Increase timeout values in test configuration
2. **Process Cleanup**: Ensure proper cleanup in `afterEach` hooks
3. **Output Matching**: Check for exact string matches vs. partial matches
4. **Race Conditions**: Add appropriate delays between commands

### Debug Techniques

```typescript
// Enable verbose logging in tests
console.log('REPL Output:', response);
console.log('Expected:', expectedOutput);

// Add debugging breakpoints
debugger;

// Use longer timeouts for debugging
jest.setTimeout(30000);
```

### Environment Variables

```bash
# Enable debug output
DEBUG=repl npm run test:repl-automation

# Increase verbosity
VERBOSE=true npm run test:repl

# Skip cleanup for debugging
NO_CLEANUP=true npm run test:repl-integration
```

## Best Practices

### Test Design

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up processes and state
3. **Timeouts**: Set appropriate timeouts for different test types
4. **Assertions**: Use specific, meaningful assertions
5. **Coverage**: Test both success and failure cases

### Performance

1. **Unit tests** should run in < 1 second each
2. **Integration tests** should complete in < 30 seconds
3. **Automation scenarios** should finish in < 5 minutes total
4. Use parallel execution where possible

### Maintenance

1. Update tests when REPL functionality changes
2. Add regression tests for bug fixes
3. Review and update test scenarios quarterly
4. Monitor CI performance and optimize slow tests

## Troubleshooting

### Common Test Failures

| Error | Cause | Solution |
|-------|-------|----------|
| "REPL startup timeout" | Process startup issues | Check dependencies, increase timeout |
| "Process not found" | Cleanup issues | Ensure proper process termination |
| "Output not found" | Timing issues | Add delays, check output format |
| "Type error in test" | TypeScript issues | Update type definitions |

### Getting Help

1. Check the test output logs for specific error messages
2. Run tests individually to isolate issues
3. Use the debugging techniques described above
4. Review recent changes to REPL-related code

## Future Enhancements

### Planned Improvements

1. **Visual Test Reports**: HTML test result dashboards
2. **Performance Baselines**: Historical performance tracking
3. **Stress Testing**: High-load scenario testing
4. **Property-Based Testing**: Automated input generation
5. **Browser Testing**: Web-based REPL testing
6. **Load Testing**: Concurrent user simulation

### Contributing

To contribute to the REPL testing system:

1. Follow the existing test patterns
2. Add comprehensive test coverage for new features
3. Update documentation for new test types
4. Ensure all tests pass in CI before submitting PRs
5. Include performance considerations in test design