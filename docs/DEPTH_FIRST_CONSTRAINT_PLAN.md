# Updated Trait System Recovery Plan

## Current State Assessment

### What's Working ✅
1. **Trait Registry Infrastructure**: Properly created and populated with stdlib definitions
2. **Trait Definitions**: Constraint definitions parsed and added correctly
3. **Trait Implementations**: Implement definitions parsed and added correctly  
4. **Basic Trait Function Detection**: System can identify trait functions and get signatures
5. **Stdlib Loading**: All trait definitions and implementations from stdlib.noo are loaded
6. **Basic Structural Constraints**: Simple accessor constraints work correctly
7. **Option/Result Trait Resolution**: `map (fn x => x + 1) (Some 42)` works correctly

### What's Broken ❌
1. **List Trait Function Resolution**: `map (fn x => x + 1) [1, 2, 3]` returns `f Float` instead of `List Float`
2. **Partial Application Constraint Preservation**: `mapIncrement = map (fn x => x + 1)` returns function type instead of constrained type
3. **Nested Function Applications**: `map double (map increment [1, 2, 3])` returns `f Float` instead of `List Float`
4. **ADT Pattern Matching Integration**: Trait functions don't work properly with pattern matching
5. **Evaluation Integration**: Trait functions don't evaluate correctly at runtime
6. **Accessor Composition**: `map @name [{@name 'bob'}]` returns `f String` instead of `List String`
7. **Accessor Partial Application**: `mapGetName = map getName` doesn't preserve constraints correctly

## Root Cause Analysis

### Primary Issue: Incorrect Trait Function Resolution for Lists
The `resolveTraitFunction` function in `src/typer/trait-system.ts:162-220` has a fundamental flaw:

```typescript
// CURRENT (BROKEN): Only looks at first argument
const firstArgTypeName = getTypeName(argTypes[0]);

// SHOULD BE: Look at the correct argument based on trait function signature
// For map: (a -> b) -> f a -> f b, look at second argument (f a)
// For bind: m a -> (a -> m b) -> m b, look at first argument (m a)  
// For pure: a -> m a, look at return type (m a)
```

**Evidence**: All failing tests show the same pattern - getting `f Float` instead of `List Float`, indicating the trait system can't resolve the List implementation.

### Secondary Issue: Constraint Preservation in Partial Application
When trait functions are partially applied, the constraints are not being preserved correctly:

```typescript
// CURRENT (BROKEN): Returns function type
mapIncrement = map (fn x => x + 1) // Returns: function type

// SHOULD BE: Returns constrained type
mapIncrement = map (fn x => x + 1) // Should return: constrained type with Functor constraint
```

### Tertiary Issue: Structural Constraint Integration
The depth-first constraint plan was partially implemented but structural constraints are not integrating properly with trait functions:

```typescript
// CURRENT (BROKEN): Returns f String instead of List String
map @name [{@name 'bob'}] // Returns: f String

// SHOULD BE: Returns List String
map @name [{@name 'bob'}] // Should return: List String
```

## Recovery Plan

### Phase 1: Fix Trait Function Resolution (Priority 1)
**Goal**: Make `map (fn x => x + 1) [1, 2, 3]` return `List Float` instead of `f Float`

**Files to modify**:
- `src/typer/trait-system.ts` - Fix `resolveTraitFunction`
- `src/typer/trait-function-handling.ts` - May need updates

**Implementation**:
1. **Analyze trait function signatures** to determine which argument contains the container type
2. **Update `resolveTraitFunction`** to look at the correct argument
3. **Add signature analysis** for common trait patterns:
   - `map: (a -> b) -> f a -> f b` → Look at 2nd arg
   - `bind: m a -> (a -> m b) -> m b` → Look at 1st arg  
   - `pure: a -> m a` → Look at return type
   - `show: a -> String` → Look at 1st arg

**Tests to fix**:
- `should resolve Functor constraint for List`
- `should handle nested function applications`
- `should integrate with ADT pattern matching`
- `should evaluate trait functions with stdlib`
- `map should work with unary trait functions`
- `List with integers should collapse to concrete type`

### Phase 2: Fix Constraint Preservation (Priority 2)
**Goal**: Make partial application preserve constraints correctly

**Files to modify**:
- `src/typer/trait-function-handling.ts` - Fix partial application logic
- `src/typer/constraint-resolution.ts` - May need updates

**Implementation**:
1. **Fix partial trait function application** to preserve constraints
2. **Ensure constrained types are returned** for partially applied trait functions
3. **Test constraint preservation** across different trait functions

**Tests to fix**:
- `should handle partial application with constraint preservation`

### Phase 3: Fix Structural Constraint Integration (Priority 3)
**Goal**: Make accessor composition work correctly with trait functions

**Files to modify**:
- `src/typer/type-inference.ts` - Check depth-first constraint generation
- `src/typer/constraint-resolution.ts` - Verify constraint resolution

**Implementation**:
1. **Debug depth-first constraint generation** in `generateDepthFirstConstraints`
2. **Verify constraint resolution** for structural constraints
3. **Test accessor composition** like `@street (@address person)`

**Tests to fix**:
- `Mapping accessors over lists`
- `should work with accessor partial application`

## Technical Implementation Details

### Trait Function Resolution Fix

The key insight is that trait functions have different argument patterns:

```typescript
// Current broken logic
function resolveTraitFunction(registry, functionName, argTypes) {
  const firstArgTypeName = getTypeName(argTypes[0]); // ❌ Wrong
  // ... look for implementation of firstArgTypeName
}

// Fixed logic
function resolveTraitFunction(registry, functionName, argTypes) {
  const containerArgIndex = getContainerArgIndex(functionName, argTypes); // ✅ Correct
  const containerTypeName = getTypeName(argTypes[containerArgIndex]);
  // ... look for implementation of containerTypeName
}

function getContainerArgIndex(functionName, argTypes) {
  switch (functionName) {
    case 'map': return 1; // (a -> b) -> f a -> f b
    case 'bind': return 0; // m a -> (a -> m b) -> m b  
    case 'pure': return -1; // a -> m a (return type)
    case 'show': return 0; // a -> String
    default: return 0; // fallback
  }
}
```

### Constraint Preservation Fix

For partial application, we need to ensure constraints are preserved:

```typescript
// In handlePartialTraitFunctionApplication
function handlePartialTraitFunctionApplication(expr, traitFuncType, argTypes, currentState, funcResult) {
  // ... existing logic ...
  
  // CRITICAL: Return constrained type with trait constraint
  const constrainedType = createConstrainedType(
    resultType,
    new Map([[traitDef.typeParam, [implementsConstraint(traitDef.typeParam, traitName)]]])
  );
  
  return createTypeResult(constrainedType, allEffects, currentState);
}
```

## Success Criteria

### Phase 1 Success
- [ ] `map (fn x => x + 1) [1, 2, 3]` returns `List Float`
- [ ] `map show [1, 2, 3]` returns `List String`
- [ ] `map double (map increment [1, 2, 3])` returns `List Float`
- [ ] Trait functions work with ADT pattern matching
- [ ] Trait functions evaluate correctly at runtime

### Phase 2 Success  
- [ ] `mapIncrement = map (fn x => x + 1)` returns constrained type with Functor constraint
- [ ] Partial application preserves constraints for all trait functions

### Phase 3 Success
- [ ] `map @name [{@name 'bob'}]` returns `List String`
- [ ] `mapGetName = map getName` preserves constraints correctly
- [ ] All structural constraint tests pass

## Risk Assessment

### Low Risk
- Trait function resolution fix is isolated to one function
- Existing trait registry infrastructure is solid
- Option/Result trait resolution already works

### Medium Risk  
- Constraint preservation changes may affect other constraint types
- Need to verify no regression in trait constraint functionality

### Mitigation
- Test thoroughly after each phase
- Keep existing tests as regression guards
- Focus on one issue at a time

## Timeline Estimate

- **Phase 1**: 2-3 hours (core fix that addresses most failures)
- **Phase 2**: 1-2 hours (constraint preservation)  
- **Phase 3**: 1-2 hours (structural constraint integration)

**Total**: 4-7 hours to fully recover trait system functionality

## Alternative Approaches Considered

### Option A: Complete Rewrite
**Rejected**: Too risky, existing infrastructure is solid

### Option B: Keep Current System + Workarounds  
**Rejected**: Would perpetuate architectural issues

### Option C: Targeted Fixes (Chosen)
**Rationale**: Addresses root causes while preserving working infrastructure