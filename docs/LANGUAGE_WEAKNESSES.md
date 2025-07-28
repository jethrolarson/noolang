# Language Weaknesses Identified

This document tracks language implementation issues and design weaknesses discovered during comprehensive example testing.

## Critical Issues

### 1. Generic ADT Constructor Type Issues

**Problem**: Generic ADT constructors fail with type constraint errors.

```noolang
# This fails with type unification error
type Point a = Point a a;
origin = Point 0.0 0.0;
# Error: Function application type mismatch in applying argument 1
# Expected: a α382, Got: Float
```

**Root Cause**: The type system is expecting a constrained type variable but getting a concrete Float type. The constraint system is not properly handling the unification of generic ADT constructors with concrete types.

**Impact**: High - Makes generic ADTs unusable in practice.

**Workaround**: Use concrete types instead of generics:
```noolang
type IntPoint = IntPoint Float Float;  # Works
```

### 2. Trait Function Name Shadowing

**Problem**: Built-in trait functions like `add`, `multiply`, `equals` cannot be shadowed by user variables.

```noolang
# This fails
add = fn a b => a + b;
# Error: Cannot define variable 'add' as it shadows the trait function 'add'
```

**Root Cause**: The trait system reserves function names globally, preventing redefinition.

**Impact**: Medium - Reduces flexibility and breaks existing code that used common names.

**Current Workaround**: Use different variable names (`add_func`, `multiply_func`).

### 3. Trait Function Return Type Issues

**Problem**: Some trait functions return incorrect types, causing type unification failures.

```noolang
# equals should return Bool but returns type variable
filter (fn x => equals x 1) [1, 2, 3]
# Error: Variant name mismatch: Bool vs α129
```

**Root Cause**: Trait function type signatures may be incorrectly defined or the constraint resolution is failing to properly unify return types.

**Impact**: Medium - Makes trait functions unreliable for use in higher-order functions.

**Workaround**: Use built-in operators (`==` instead of `equals`).

### 4. Pipeline vs Thrush Operator Confusion

**Problem**: The distinction between `|>` (pipeline/composition) and `|` (thrush/application) is not intuitive and causes frequent errors.

```noolang
# This fails - wrong operator choice
[1, 2, 3] |> head
# Error: Cannot compose non-function types

# This works
[1, 2, 3] | head
```

**Root Cause**: The semantic difference between function composition and function application is not clear from syntax.

**Impact**: Medium - Creates confusion for users and requires frequent corrections.

**Suggestion**: Consider syntax that makes the distinction clearer or provide better error messages.

### 5. Constraint System with Higher-Order Functions

**Problem**: The constraint system has issues when trait functions are used with higher-order functions like `map`.

```noolang
# This fails with constraint resolution issues
numbers | map show
# Error: No implementation of Show for function
```

**Root Cause**: The constraint resolver is incorrectly trying to find Show implementation for the `map` function itself rather than the list elements.

**Impact**: Medium - Makes trait functions difficult to use with functional programming patterns.

**Workaround**: Use direct function application instead of pipeline operators.

## Design Issues

### 6. Type Annotation Syntax Inconsistencies

**Problem**: Record type annotations don't work consistently.

```noolang
# This causes unification errors
math = { @add add_func, @multiply multiply_func } : { @add Float -> Float -> Float, @multiply Float -> Float -> Float };
```

**Root Cause**: Type annotation syntax for records with function fields may not be properly implemented.

**Impact**: Low - Can be worked around by removing type annotations.

### 7. Boolean Literal Case Sensitivity

**Problem**: Boolean literals must be capitalized (`True`, `False`) but this isn't documented clearly.

```noolang
# This fails
active = true;  # Error: Undefined variable

# This works
active = True;
```

**Impact**: Low - Minor documentation issue.

## Error Message Quality Issues

### 8. Unhelpful Error Line Numbers

**Problem**: Error messages sometimes point to incorrect line numbers or don't provide enough context.

**Examples**:
- Type errors in complex expressions point to start of expression rather than specific problematic part
- Missing variable errors don't suggest similar named variables
- Constraint resolution failures don't explain which constraint failed

**Impact**: Medium - Makes debugging difficult.

## Performance Issues

### 9. Type Inference Performance

**Observation**: Type inference takes 50-70% of total execution time even for simple programs.

```
Performance (189.5ms total, 22 lines, 519 chars):
  Type:  110.2ms  (58.2% of total)
```

**Impact**: Low for development, could be high for larger programs.

## Missing Language Features

### 10. Module System

**Problem**: No module system for organizing code across files.

**Impact**: High for larger projects.

### 11. Standard Library Gaps

**Problem**: Missing common functions that would reduce the need for trait functions:
- String manipulation functions
- More list utilities  
- File I/O functions
- Mathematical functions

**Impact**: Medium - Forces users to implement basic functionality.

## Recommendations for Follow-up

### High Priority
1. Fix generic ADT constructor type issues
2. Improve constraint resolution for trait functions
3. Better error messages with correct line numbers
4. Resolve trait function return type issues

### Medium Priority  
1. Review trait function name reservation policy
2. Improve pipeline vs thrush operator distinction
3. Add missing standard library functions
4. Performance optimization for type inference

### Low Priority
1. Consistent type annotation syntax
2. Better documentation for language syntax rules
3. Module system design and implementation

## Test Cases to Add

1. Generic ADT constructor edge cases
2. Trait function constraint resolution scenarios  
3. Complex pipeline operator usage
4. Higher-order function with trait function combinations
5. Performance benchmarks for type inference

## Updated Example Status

After testing and fixing, here's the current status of examples:

- ✅ `basic.noo` - Works correctly
- ✅ `adt_demo.noo` - Works correctly  
- ✅ `safe_thrush_demo.noo` - Works correctly
- ✅ `simple_adt.noo` - Works correctly
- ✅ `minimal_trait_test.noo` - Works correctly
- ❌ `demo.noo` - Generic ADT constructor issues
- ❌ `type_system_demo.noo` - Type annotation issues
- ❌ `constraints_demo.noo` - Missing variables (fixed but other issues remain)
- ❌ `trait_system_demo.noo` - Trait function constraint issues
- ❌ `generic_safe_thrush_demo.noo` - Safe thrush operator fails with Result monad 
- ❌ `trait_truly_multiline_demo.noo` - Type mismatch errors in function application
- ✅ `math_functions.noo` - Works correctly (simple trait function definitions)

Priority should be on fixing the core type system issues that prevent the main demo examples from working.