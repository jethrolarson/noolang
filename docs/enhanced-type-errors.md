# Enhanced Type Error Messages

Noolang now provides much more illuminating type error messages that help developers quickly understand and fix type issues.

## Overview

The enhanced type error system provides:
- **Detailed context**: Shows expected vs actual types clearly
- **Helpful suggestions**: Offers specific guidance on how to fix the issue
- **Better formatting**: Clean, readable error messages with proper indentation
- **Location information**: Shows where the error occurred in the code

## Error Message Format

All type errors now follow this enhanced format:

```
TypeError: [Error Type]
  Expected: [Expected Type]
  Got:      [Actual Type]
  [Additional Context]
  at line [X], column [Y]

💡 [Helpful suggestion]
```

## Examples

### Undefined Variable
```noolang
undefined_var
```

**Error:**
```
TypeError: Undefined variable
  Variable: undefined_var
  at line 1, column 1

💡 Define 'undefined_var' before using it: undefined_var = value
```

### Function Application Type Mismatch
```noolang
(fn x => x + 1) "hello"
```

**Error:**
```
TypeError: Type mismatch in function application
  Expected: Int
  Got:      String
  Parameter 1
  at line 1, column 2

💡 Argument 1 has type String but the function expects Int. Consider using a different value or adding a type conversion.
```

### Operator Type Mismatch
```noolang
"hello" + 5
```

**Error:**
```
TypeError: Operator type mismatch
  Expected: Int
  Got:      String
  Operator: +
  at line 1, column 1

💡 The + operator expects Int but got String. Check your operand types.
```

### Condition Type Error
```noolang
if 42 then 1 else 2
```

**Error:**
```
TypeError: Condition must be boolean
  at line 1, column 1

💡 Use a boolean expression (true/false) or a comparison that returns a boolean.
```

### If Branch Type Mismatch
```noolang
if true then 1 else "hello"
```

**Error:**
```
TypeError: If branches must have the same type
  Expected: Int
  Got:      String
  at line 1, column 1

💡 Both branches of an if expression must return the same type. Consider adding type annotations or using compatible expressions.
```

### List Element Type Mismatch
```noolang
[1, "hello", 3]
```

**Error:**
```
TypeError: List elements must have the same type
  Expected: Int
  Got:      String
  at line 1, column 1

💡 All elements in a list must have the same type. Consider using a tuple for mixed types or ensuring all elements are compatible.
```

### Type Annotation Mismatch
```noolang
x = 42 : String
```

**Error:**
```
TypeError: Type annotation mismatch
  Expected: String
  Got:      Int
  at line 1, column 5

💡 The explicit type annotation doesn't match the inferred type. Either adjust the annotation or modify the expression.
```

### Non-Function Application
```noolang
42 5
```

**Error:**
```
TypeError: Cannot apply non-function type
  at line 1, column 1

💡 Only functions can be applied to arguments. Make sure you're calling a function, not a value.
```

### Pipeline Composition Error
```noolang
(fn x => x + 1) |> (fn x => x == "hello")
```

**Error:**
```
TypeError: Pipeline composition type mismatch
  Expected: String
  Got:      Int
  at line 1, column 2

💡 The output type of the first function must match the input type of the second function in a pipeline.
```

## Implementation Details

### Error Types Supported

The enhanced error system covers these common type errors:

1. **Undefined Variable** (`undefinedVariableError`)
2. **Function Application** (`functionApplicationError`)
3. **Operator Type Mismatch** (`operatorTypeError`)
4. **Condition Type Error** (`conditionTypeError`)
5. **If Branch Type Mismatch** (`ifBranchTypeError`)
6. **Type Annotation Mismatch** (`typeAnnotationError`)
7. **List Element Type Mismatch** (`listElementTypeError`)
8. **Non-Function Application** (`nonFunctionApplicationError`)
9. **Pipeline Composition Error** (`pipelineCompositionError`)
10. **Mutation Type Error** (`mutationTypeError`)

### Error Context

Each error includes relevant context:
- **Expected vs Actual Types**: Clear comparison of what was expected vs what was provided
- **Function Names**: When applicable, shows which function had the issue
- **Parameter Index**: For function applications, shows which parameter had the issue
- **Operator Information**: For operator errors, shows which operator was used
- **Variable Names**: For variable errors, shows the problematic variable name

### Suggestions

The system provides intelligent suggestions based on the error type:
- **Variable errors**: Shows how to define the variable
- **Type mismatches**: Suggests type conversions or alternative approaches
- **Function errors**: Explains parameter requirements
- **Operator errors**: Clarifies operand type requirements
- **Condition errors**: Suggests boolean expressions
- **List errors**: Recommends tuples for mixed types

## Benefits

1. **Faster Debugging**: Clear error messages help identify issues quickly
2. **Better Learning**: Suggestions help developers understand the type system
3. **Reduced Frustration**: Less time spent guessing what went wrong
4. **LLM-Friendly**: Structured error messages work well with AI assistants
5. **Consistent Format**: All type errors follow the same clear pattern

## Usage

The enhanced error messages are automatically used by:
- **CLI**: `npx ts-node src/cli.ts --eval "code"`
- **REPL**: Interactive development environment
- **Tests**: All type checking operations

No configuration is needed - the enhanced messages are the default behavior. 