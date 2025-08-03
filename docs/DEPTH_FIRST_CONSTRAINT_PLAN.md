# Depth-First Constraint Generation Plan

## Problem Statement

Current system has two disconnected constraint generation phases:
1. **Expression typing**: Creates and unifies type variables during function application
2. **Constraint collection**: Separate pass that creates fresh variables for the same logical constraints

This causes variable space disconnection where `@street (@address person)` creates:
- Expression typing variables: `person_α → address_β → street_γ` (unified chain)
- Constraint collection variables: `person_δ → address_ε → street_ζ` (separate chain)

Result: Constraint resolution can't connect the chains, returns intermediate types instead of final values.

## Root Cause Analysis

The issue isn't algorithmic complexity - it's **architectural duplication**:
- Expression typing already follows depth-first function application order
- Expression typing already creates and unifies the correct variables
- Constraint collection duplicates this work with disconnected variables

## Proposed Solution

**Eliminate the separate constraint collection phase.** Generate constraints inline during expression typing when we already have the unified variable space.

### Key Insight
Function application naturally follows depth-first order:
```
@street (@address person)
1. Evaluate innermost: (@address person) 
2. Apply result to @street
```

Expression typing already does this correctly. We just need to capture the constraints during this process instead of recreating them later.

## Implementation Plan

### Phase 1: Remove Separate Constraint Collection
- **File**: `src/typer/type-inference.ts:762-770`
- **Change**: Remove the call to `collectAccessorConstraints` 
- **Rationale**: This creates the disconnected variables

### Phase 2: Inline Constraint Generation in Function Application
- **File**: `src/typer/function-application.ts` 
- **Location**: In `typeApplication` when applying accessor functions
- **Strategy**: When typing `@field obj`, immediately generate constraint `obj_var has {field: result_var}` using the actual variables from unification

### Phase 3: Handle Composition Cases
- **Simple**: `@field obj` → `obj has {field: result}`
- **Composed**: `@street (@address person)` → Natural depth-first generates `person has {address: {street: result}}`
- **Tacit**: `compose @street @address` → Use same inline generation during composition typing

### Phase 4: Preserve Other Constraint Types
- **Trait constraints**: Already working, don't change
- **Multiple independent access**: `fn p => (@name p, @age p)` → Generate separate constraints as expected

## Technical Details

### Current Flow (Broken)
```
1. typeFunction creates parameter variables
2. Expression typing: unifies through function applications
3. collectAccessorConstraints: creates fresh variables for same logical paths
4. Constraint resolution: can't connect variable spaces
```

### New Flow (Fixed)  
```
1. typeFunction creates parameter variables
2. Expression typing: unifies through function applications
   └── Generate constraints inline using unified variables
3. Constraint resolution: works with unified variable space
```

### Variable Management
- **Multiplicative constraints**: Single path compositions like `@street (@address person)`
- **Additive constraints**: Multiple independent requirements like `(@name p, @age p)`
- **Tacit support**: Works because function composition typing naturally follows the same depth-first pattern

## Expected Benefits

1. **Fixes accessor composition**: `@street (@address person)` returns final string instead of intermediate record
2. **Supports tacit programming**: `compose @street @address` works without lexical variable hints  
3. **Eliminates variable coordination problems**: Single source of truth for variables
4. **Simpler architecture**: Fewer moving parts, no duplicate constraint analysis
5. **Natural depth-first**: Aligns with function application evaluation order

## Risks and Mitigations

### Risk: Breaking existing constraint generation for non-accessor cases
**Mitigation**: Preserve existing trait constraint generation, only change structural constraints

### Risk: Complex composition cases become harder to handle
**Mitigation**: Depth-first naturally handles arbitrary nesting, should be simpler than current approach

### Risk: Performance impact from inline generation
**Mitigation**: Should be faster - eliminates separate traversal pass

## Test Cases to Verify

1. **Simple accessor**: `@name person` → String (should still work)
2. **Accessor composition**: `@street (@address person)` → String (currently broken, should fix)
3. **Multiple access**: `fn p => (@name p, @age p)` → (String, Float) (should still work)
4. **Tacit composition**: `compose @street @address` → function with correct constraints
5. **Mixed expressions**: `@street (transform (@address person))` → Should handle arbitrary composition

## Success Criteria

- All structural constraint tests pass
- Accessor composition returns final values, not intermediate records
- No regression in trait constraint functionality
- Tacit composition works correctly
- Simplified codebase with eliminated duplication

## Alternative Considered

**Constraint unification**: Keep both systems, add complex unification between variable spaces.
**Rejected because**: Adds complexity without solving the fundamental duplication problem.

The depth-first inline approach eliminates the root cause rather than working around it.