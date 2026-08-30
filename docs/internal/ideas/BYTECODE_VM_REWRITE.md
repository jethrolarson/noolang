# Need: bytecode/explicit-stack VM, eventually

## Problem

The evaluator is tree-walking and uses the JS call stack as its own: control flow
(recursion, branching) and environment capture (closures) both ride directly on JS
function calls and JS closures. That coupling is a ceiling, not a single bug — it
shows up as stack overflow on deep recursion ([[TAIL_CALL_OPTIMIZATION]]), but the
same coupling also blocks: decent stepping/debugging support, real perf work
(everything pays JS call overhead + GC churn per node), and any future bytecode-level
optimization (constant folding, inline caching, etc.) — there is no intermediate
representation to optimize, only the AST itself.

## Direction

A real bytecode compiler + explicit-stack VM (operand stack, call stack, frames as
data, not JS frames). Likely candidate for a low-level implementation language
(Rust or similar) once/if performance becomes an actual constraint, rather than a
rewrite of the current TS evaluator in place.

## Why not now

This is a second interpreter, not a fix to the current one: it replaces execution
semantics for effects tracking, trait dispatch, closures, everything currently
free-riding on JS's call stack and closures. Multi-week scope, and a rewrite carries
a worse version of the type-inference hazard in AGENTS.md — a green suite proves the
new VM doesn't crash, not that its semantics match the old evaluator, and there's no
cheap way to diff "silently different behavior" across two different execution
models.

[[TAIL_CALL_OPTIMIZATION]] (option A there) fixes the concrete problem that's
actually been hit — stack overflow on tail recursion — without this. Do that first.

## Status

Not started, not scheduled. Revisit when there's an actual performance or
tooling (debugger/stepper) need, not preemptively.
