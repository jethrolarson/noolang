/**
 * Drop-in replacement for unify() that uses constraint solving internally
 *
 * This provides the same interface as the existing unify function but uses
 * the constraint solver for better performance and extensibility.
 */

import { Type } from '../ast';
import { TypeState } from './types';
import { ConstraintSolver, UnificationConstraint } from './constraint-solver';

// Drop-in replacement for the existing unify function
// Track unify call frequency
let unifyCallCount = 0;
let totalUnifyTime = 0;
let lastReportTime = Date.now();

export const constraintBasedUnify = (
	t1: Type,
	t2: Type,
	state: TypeState,
	location?: { line: number; column: number }
): TypeState => {
	const unifyStart = Date.now();
	unifyCallCount++;

	// Create a constraint solver
	const solver = new ConstraintSolver();

	// Add the unification constraint
	const constraint: UnificationConstraint = {
		kind: 'equal',
		type1: t1,
		type2: t2,
		location,
	};

	solver.addConstraint(constraint);

	// Solve the constraints
	const result = solver.solve();

	if (!result.success) {
		// Throw the first error - this matches the existing unify behavior
		throw new Error(result.errors[0] || 'Unification failed');
	}

	// Merge the new substitutions into the existing state
	const newSubstitution = new Map(state.substitution);
	for (const [typeVar, type] of result.substitution) {
		newSubstitution.set(typeVar, type);
	}

	const unifyTime = Date.now() - unifyStart;
	totalUnifyTime += unifyTime;

	// Report slow individual unify calls
	if (unifyTime > 5) {
		console.warn(
			`SLOW UNIFY: ${unifyTime}ms for ${t1.kind}:${t1.kind === 'variable' ? t1.name : '?'} = ${t2.kind}:${t2.kind === 'variable' ? t2.name : '?'} (${result.substitution.size} subs)`
		);
	}

	// Report every 1000 calls
	if (unifyCallCount % 1000 === 0) {
		const now = Date.now();
		const elapsed = now - lastReportTime;
		console.warn(
			`Constraint unify: ${unifyCallCount} calls, ${totalUnifyTime}ms total, last 1000 in ${elapsed}ms`
		);
		lastReportTime = now;
	}

	return {
		...state,
		substitution: newSubstitution,
	};
};

// Test the constraint-based unify with a simple case
export const testConstraintUnify = () => {
	const { typeVariable, intType } = require('../ast');
	const { createTypeState } = require('./type-operations');

	const state = createTypeState();
	const t1 = typeVariable('a');
	const t2 = intType();

	try {
		const result = constraintBasedUnify(t1, t2, state);
		console.log('Constraint unify test passed:', result.substitution.get('a'));
		return true;
	} catch (error) {
		console.error('Constraint unify test failed:', error);
		return false;
	}
};
