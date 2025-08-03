Absolutely! Let's write up a plan for the best-effort name restoration feature and you can tackle it when you have time.

## Plan: Best-Effort Original Name Restoration

### Goal

Improve UX by restoring original variable names (like `f` instead of `c`) during type display, while maintaining type safety.

### Implementation Steps

1. **Track Original Names During Freshening**
   - Modify `freshenTypeVariables` in `src/typer/type-operations.ts`
   - Store original → fresh mappings: `Map<string, string>`
   - Add to `TypeState` or pass as parameter

2. **Best-Effort Restoration in `typeToString`**
   - Modify `norm` function in `src/typer/helpers.ts`
   - Try to restore original names when `normalizeVariables` is true
   - Check for conflicts before restoring

3. **Conflict Resolution**
   - If multiple original names would map to same normalized name, keep freshened name
   - Prioritize most common/important names (like `f` for Functor)

4. **Testing**
   - Add tests for name restoration
   - Test conflict scenarios
   - Ensure fallback behavior works

### Expected Results

- `map` → `(a -> b) -> f a -> f b given f implements Functor` (restored)
- `map (add 1)` → `f Float -> f Float given f implements Functor` (consistent)
- Fallback to current behavior if conflicts arise

### Files to Modify

- `src/typer/type-operations.ts` - track original names
- `src/typer/helpers.ts` - restore names in display
- `src/typer/__tests__/type-display.test.ts` - add tests

This would be a nice UX improvement that doesn't affect the core type system logic.
