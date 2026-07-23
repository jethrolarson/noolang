# Destructuring N+1 fields from a module import corrupts unrelated inference

Filed 2026-07-23, found while adding stdlib.test.noo coverage.

## Symptom

`stdlib.test.noo`'s import line was, as committed and passing:

    {@test_case test_case, @group group, @expect_eq expect_eq, @expect expect} = import "std/test";

Adding a fifth field to the same destructuring pattern — any field, and
whether or not the new binding is ever used — breaks type inference on an
unrelated expression later in the same file:

    {@test_case test_case, @group group, @expect_eq expect_eq, @expect expect, @fail fail} = import "std/test";
    ...
    expect_eq "a, b, c" (join ", " ["a", "b", "c"])   # <- fails here

    TypeError: Function application type mismatch in applying argument 1
      Expected: Option Float
      Got:      String

`expect_eq`'s parameter type is somehow being pinned to `Option Float` (the
type it resolves to for the *first* group in the file, which compares
`Option` values) rather than generalized per call site, and only once a 5th
field is pulled from the import.

## Confirmed general, not `expect_all`-specific

Reproduced with four different unused 5th fields (`@fail`, `@expect_ok`,
`@run_tree`, `@expect_all`) — same error, same location, every time. Field
*count* in one destructuring pattern is the trigger, not which field.

## Not reproducible in isolation

A minimal record literal destructured at varying arity (1-5 fields, no
import) does not reproduce it. A minimal `import "std/test"` destructure
combined with a trivial `join`/`==` expression does not reproduce it either.
It needs the fuller file: multiple `test_case`/`expect_eq` call sites at
different concrete types (`Option Float` in one group, `String` in another),
plus the module import, plus the extra destructured field. Not yet reduced
further — whoever picks this up should start from `/tmp/orig.noo` +
`/tmp/vary_1.noo` pattern in this session's transcript, or reconstruct from
stdlib.test.noo's pre-bug-discovery version (the git history around the
commit "Fix stdlib apply/join/tail...").

## Workaround (in use)

Split the import into two destructuring statements instead of one wider one:

    {@test_case test_case, @group group, @expect_eq expect_eq, @expect expect} = import "std/test";
    {@expect_all expect_all} = import "std/test";

Confirmed this avoids the bug. stdlib.test.noo uses this pattern for
`expect_all`.

## Suspicion, not confirmed

Given the workaround shape, this smells like the module-import typing path
narrowing/closing the imported record's row type based on destructured
arity, and that narrowing leaking mutable substitution state into the host
file's later, unrelated unification — rather than each `test_case`/
`expect_eq` call site being independently generalized. Not verified against
the actual typer code; whoever picks this up should start in
`src/typer/` wherever record-destructuring definitions and module imports
are typed (likely `type-inference.ts`'s destructuring-definition handling
and the import-typing path referenced in `test/import-typing.test.ts`).

## Why not fixed now

Found mid-task while adding stdlib test coverage (unrelated goal), and the
workaround is cheap and sufficient for that task. This is a correctness bug
in the typer's handling of record-destructuring imports, not scoped to
stdlib — could affect any program that imports more names from a module.
Severity is real (silent, unrelated type corruption) but a full
investigation is its own project matching CLAUDE.md's type-inference hazard
description almost exactly: "goes green and wrong at the same time."

## Trigger for picking this up

Should be picked up soon regardless of a new trigger event — this is a
correctness bug with a cheap, already-demonstrated workaround, not a
speculative gap. Suggested next step: reduce the repro further (bisect the
file content, not just field count) before touching the typer.
