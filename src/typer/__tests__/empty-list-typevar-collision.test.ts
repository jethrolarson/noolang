import { describe, expect, it } from 'bun:test';
import { runCode } from '../../../test/utils';

// Regression test for the empty-list type-variable collision bug
// (doc retired once this fix landed).
//
// typeList's empty-list case hardcoded typeVariable('a') instead of minting a
// fresh one via freshTypeVariable(state). Because state.substitution is a
// single map keyed by variable *name* and threaded through the whole program,
// every bare `[]` literal produced a type variable literally named 'a', so
// two unrelated `[]` literals in different top-level bindings could collide:
// unifying the first one against its constructor's payload type left a
// stale `a -> <that type>` binding in the shared substitution, which then
// broke unification for the second, unrelated `[]`.
describe('empty list type-variable collision', () => {
	it('does not let one bare [] poison a differently-shaped bare [] elsewhere', () => {
		const code = `
			variant M = MA (List Float) | MO (List {String, Float});
			x = MO [];
			y = MA [];
			x
		`;
		// Should typecheck without throwing "Cannot unify types".
		expect(() => runCode(code)).not.toThrow();
	});

	it('is order-independent (swapping the definitions also typechecks)', () => {
		const code = `
			variant M = MA (List Float) | MO (List {String, Float});
			y = MA [];
			x = MO [];
			x
		`;
		expect(() => runCode(code)).not.toThrow();
	});
});
