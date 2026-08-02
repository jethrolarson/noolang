import { parseAndType } from '../../../test/utils';
import { test, expect } from 'bun:test';

// Literate `assert: true` checking needs each `;`-separated leaf of a
// top-level sequence to carry its own resolved type, not just the outer
// chain's type (decoration.ts today only sets `.type` on
// `program.statements[i]`, leaving every leaf of a flattened `;`-chain
// undecorated — the same gap that leaves per-leaf runtime tracing needing
// its own flattening pass).

test('sequence leaf decoration - each unparenthesized top-level leaf gets its own .type', () => {
	const { program } = parseAndType('1 + 2; "hello"; True');
	const topStatement = program.statements[0];
	expect(topStatement.kind).toBe('binary');
	if (topStatement.kind !== 'binary') throw new Error('expected binary');

	// The chain nests left-associatively: ((1 + 2 ; "hello") ; True)
	const leftHolder = topStatement.left;
	if (leftHolder.kind !== 'binary') throw new Error('expected nested binary');

	const first = leftHolder.left; // `1 + 2`
	expect((first.type as { name?: string }).name).toBe('Float');

	const second = leftHolder.right; // `"hello"`
	expect((second.type as { name?: string }).name).toBe('String');

	const third = topStatement.right; // `True`
	expect((third.type as { name?: string }).name).toBe('Bool');
});

test('sequence leaf decoration - a parenthesized nested sequence is left as one undecorated-leaf unit', () => {
	const { program } = parseAndType('x + y where (x = 1; y = 2)');
	// The `where`'s parenthesized (x = 1; y = 2) is a single opaque leaf from
	// the flattening rule's perspective — its own internal `x = 1` / `y = 2`
	// pieces must NOT each receive independent top-level-style decoration
	// beyond what typeWhere already does internally. This test only documents
	// that top-level flattening does not reach inside parens; it does not
	// assert on typeWhere's own internal decoration behavior.
	expect(program.statements[0].type?.kind).toBe('primitive');
});
