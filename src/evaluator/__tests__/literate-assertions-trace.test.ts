import { parseAndType } from '../../../test/utils';
import { Evaluator } from '../evaluator';
import { test, expect } from 'bun:test';

// Literate `assert: true` checking needs one ExecutionStep per un-parenthesized
// top-level `;`-leaf (each source line an author wrote), not one per
// program.statements entry (evaluateProgram's default, which collapses a
// whole `;`-chain into a single trace entry holding only the last leaf's
// value — confirmed live against README.md, where a mid-chain `# => 3`
// line was checked against a later line's unrelated value).

test('evaluateProgramForAssertions - one ExecutionStep per unparenthesized top-level leaf', () => {
	const { program, state } = parseAndType('x = 1; y = 2; x + y; z = 10; x + z');
	const evaluator = new Evaluator({ traitRegistry: state.traitRegistry });
	const result = evaluator.evaluateProgramForAssertions(program);

	expect(result.executionTrace.length).toBe(5);
	expect(result.executionTrace[2].result).toEqual({ tag: 'number', value: 3 });
	expect(result.executionTrace[4].result).toEqual({ tag: 'number', value: 11 });
	expect(result.finalResult).toEqual({ tag: 'number', value: 11 });
});

test('evaluateProgramForAssertions - a parenthesized nested sequence stays one leaf', () => {
	const { program, state } = parseAndType('x + y where (x = 1; y = 2); "after"');
	const evaluator = new Evaluator({ traitRegistry: state.traitRegistry });
	const result = evaluator.evaluateProgramForAssertions(program);

	// Two top-level leaves: the `where` expression, then "after" — the
	// parenthesized (x = 1; y = 2) inside `where` must not be split out.
	expect(result.executionTrace.length).toBe(2);
	expect(result.executionTrace[0].result).toEqual({ tag: 'number', value: 3 });
	expect(result.executionTrace[1].result).toEqual({ tag: 'string', value: 'after' });
});
