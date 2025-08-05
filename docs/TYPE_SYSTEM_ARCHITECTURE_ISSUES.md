# Type System Architecture Issues

This document tracks fundamental architectural inconsistencies in the Noolang type system that need to be addressed.

## Overview

The Noolang type system has several fundamental inconsistencies where types are treated as both primitive and complex types simultaneously. This creates ambiguity throughout the type checker, unification, substitution, and trait resolution systems.

## Issue 1: List Type Dual Nature

### Problem
`List` is defined as both a primitive type and a parameterized type:

1. **As Primitive** (`ast.ts:75`):
   ```typescript
   export type PrimitiveType = {
       kind: 'primitive';
       name: 'String' | 'Bool' | 'List' | 'Float';
   };
   ```

2. **As Parameterized** (`ast.ts:93-96`):
   ```typescript
   export type ListType = {
       kind: 'list';
       element: Type;
   };
   ```

### Root Cause
`List` maps to JavaScript arrays at runtime, making it "primitive" from an implementation perspective, but requires parameterization (`List Float`, `List String`) for type safety.

### Symptoms
- Complex substitution logic with special cases for `List` conversion
- Unification confusion: `f a` + `List Float` → `f = primitive List` or `f a = List Float`?
- Type constructor ambiguity in trait resolution
- Inconsistent type representations throughout codebase

### Affected Areas
- `src/typer/substitute.ts:96` - Special case primitive-to-list conversion
- `src/typer/unify.ts` - Creates `{ kind: 'primitive', name: 'List' }`
- `src/typer/function-application.ts` - Type constructor substitution
- `src/typer/trait-system.ts` - `getTypeName()` returns `'List'` for both cases

## Issue 2: Bool Type Dual Nature

### Problem
`Bool` is defined as both a primitive type and an ADT:

1. **As Primitive** (`ast.ts:75`):
   ```typescript
   name: 'String' | 'Bool' | 'List' | 'Float';
   ```

2. **As ADT** (`stdlib.noo:98`):
   ```noolang
   type Bool = True | False;
   ```

3. **As Variant** (`ast.ts:557-561`):
   ```typescript
   export const boolType = (): VariantType => ({
       kind: 'variant',
       name: 'Bool',
       args: [],
   });
   ```

### Root Cause
`Bool` was likely initially designed as a primitive type but was later implemented as an ADT in the standard library. The primitive definition was never removed.

### Symptoms
- Pattern matching on `True`/`False` requires variant type
- Built-in boolean operations may expect primitive type
- Inconsistent type checking for boolean values
- Potential unification issues between primitive and variant `Bool`

## Architectural Impact

### Type System Consistency
These dual natures create fundamental inconsistencies where:
- Different parts of the codebase expect different type representations
- Unification and substitution require complex special-case logic
- Error messages may be confusing due to type representation mismatches

### Constraint Resolution
The ambiguity may contribute to constraint-related bugs:
- Trait resolution may not handle primitive vs parameterized correctly
- Type constructor substitution becomes overly complex
- Constraint preservation may fail due to type representation confusion

### Runtime vs Compile-Time Mismatch
The disconnect between runtime implementation (JS primitives) and type system requirements (parameterization) creates ongoing architectural tension.

## Proposed Solutions

### For List Type

**Option A: Consistent Parameterized Type**
1. Remove `'List'` from `PrimitiveType` union
2. Remove `listType()` primitive constructor
3. Use only `ListType` with `listTypeWithElement()`
4. Update all substitution/unification logic
5. Bridge runtime gap with clear conversion rules

**Option B: Explicit Type Constructor System**
1. Create separate type constructor category
2. Distinguish between primitive types and type constructors
3. Make runtime mapping explicit in evaluator

### For Bool Type

**Recommended: Remove Primitive Bool**
1. Remove `'Bool'` from `PrimitiveType` union
2. Use only `VariantType` representation
3. Update any code expecting primitive bool
4. Ensure pattern matching works consistently

## Migration Strategy

### ✅ Phase 1: Documentation and Analysis (Completed)
- [x] Document the issues
- [x] Audit all usages of dual-nature types
- [x] Identify all affected code paths
- [x] Create comprehensive test suite for edge cases

### ✅ Phase 2: Incremental Fixes (Completed)
- [x] Fix Bool dual nature (simpler case)
- [x] Update error messages and type display
- [x] Ensure tests pass with single representation

### ✅ Phase 3: List Type Refactoring (Completed)
- [x] Design proper type constructor system
- [x] Migrate List to consistent representation
- [x] Update all substitution/unification logic
- [x] Handle runtime mapping explicitly

### ✅ Phase 4: Generalization (Completed)
- [x] Apply learnings to other potential dual-nature types
- [x] Establish clear principles for primitive vs complex types
- [x] Document type system architecture decisions

## Current Status

**✅ RESOLVED - December 2024**

All dual nature issues have been successfully resolved:
- **Bool dual nature fixed**: Removed 'Bool' from PrimitiveType union, now uses only VariantType
- **List dual nature fixed**: Removed 'List' from PrimitiveType union, now uses only ListType  
- **Special case handling removed**: Eliminated primitive-to-list conversions in substitute.ts
- **Constraint resolution updated**: Now creates variant List constructors instead of primitive ones
- **All tests passing**: 845 tests pass with the new consistent type representations

**Architectural Outcome:**
- Clean type system with no dual representations
- Primitive types: Only `String` and `Float` (true runtime primitives)
- Parameterized types: `List`, `Bool` use dedicated type definitions
- Native array performance preserved for Lists
- Foundation established for future type system enhancements

See `docs/TYPE_SYSTEM_FIX_SUMMARY.md` for detailed implementation notes.

## Related Files

- `src/ast.ts` - Type definitions
- `src/typer/substitute.ts` - Type substitution logic
- `src/typer/unify.ts` - Type unification
- `src/typer/function-application.ts` - Function application and type constructors
- `src/typer/trait-system.ts` - Trait resolution
- `stdlib.noo` - Standard library type definitions
- `src/evaluator/evaluator.ts` - Runtime type representations

## Impact Assessment

**Breaking Changes: Medium to High**
- Some existing code may rely on current dual representations
- Test expectations may need updating
- Type error messages may change

**Complexity: Medium**
- Well-defined scope of changes
- Clear migration path available
- Mostly internal type system changes

**Benefits: High**
- Eliminates fundamental architectural inconsistencies
- Simplifies type system logic
- Reduces special-case handling
- Improves type system reliability
- Makes future enhancements easier