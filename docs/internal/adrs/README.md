ADR Format: nygard lite

BE CONCISE! An ADR is not a spec! No redundancies! Every word tell.

Promote adrs to a folder if more files are necessary

## Numbering

Filename is `adr_NNNN.md` — no slug (`adr_` prefix, not a bare number, so
nothing choking on filenames-as-numbers in some other tool's context
misreads it). Two branches independently claiming "0008" then collide as a
real git merge conflict on that path instead of silently landing as two
different files (which is how 0002 got claimed twice before this rule
existed — `0002-a.md` and `0002-b.md` don't conflict). Title lives only in
adr_0000.md's index — add a row there when you add an ADR.
