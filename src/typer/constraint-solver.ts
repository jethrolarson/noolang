/**
 * Constraint-based unification system for Noolang
 * 
 * This replaces the direct recursive unification approach with a constraint
 * generation + solving approach that's more suitable for:
 * - Effect types
 * - Trait/typeclass constraints  
 * - Complex constraint propagation
 * - Better performance on large programs
 */

import { Type } from '../ast';

// Union-Find data structure for efficient unification
export class UnionFind {
	private parent: Map<string, string> = new Map();
	private rank: Map<string, number> = new Map();

	// Find the root representative of a type variable
	find(typeVar: string): string {
		if (!this.parent.has(typeVar)) {
			this.parent.set(typeVar, typeVar);
			this.rank.set(typeVar, 0);
			return typeVar;
		}

		// Path compression optimization
		const parent = this.parent.get(typeVar)!;
		if (parent !== typeVar) {
			this.parent.set(typeVar, this.find(parent));
		}
		return this.parent.get(typeVar)!;
	}

	// Union two type variables (with union by rank optimization)
	union(typeVar1: string, typeVar2: string): void {
		const root1 = this.find(typeVar1);
		const root2 = this.find(typeVar2);

		if (root1 === root2) return; // Already unified

		const rank1 = this.rank.get(root1) || 0;
		const rank2 = this.rank.get(root2) || 0;

		// Union by rank: attach smaller tree under root of larger tree
		if (rank1 < rank2) {
			this.parent.set(root1, root2);
		} else if (rank1 > rank2) {
			this.parent.set(root2, root1);
		} else {
			// Same rank, pick one and increment rank
			this.parent.set(root2, root1);
			this.rank.set(root1, rank1 + 1);
		}
	}

	// Check if two type variables are in the same equivalence class
	areUnified(typeVar1: string, typeVar2: string): boolean {
		return this.find(typeVar1) === this.find(typeVar2);
	}

	// Get all equivalence classes
	getEquivalenceClasses(): Map<string, string[]> {
		const classes = new Map<string, string[]>();
		
		for (const typeVar of this.parent.keys()) {
			const root = this.find(typeVar);
			if (!classes.has(root)) {
				classes.set(root, []);
			}
			classes.get(root)!.push(typeVar);
		}
		
		return classes;
	}
}

// Types of unification constraints
export type UnificationConstraint = 
	| { kind: 'equal'; type1: Type; type2: Type; location?: { line: number; column: number } }
	| { kind: 'instance'; typeVar: string; type: Type; location?: { line: number; column: number } }
	| { kind: 'check'; constraint: import('../ast').Constraint; type: Type; location?: { line: number; column: number } };

// Constraint solver state
export interface ConstraintSolverState {
	constraints: UnificationConstraint[];
	unionFind: UnionFind;
	substitution: Map<string, Type>;
	errors: string[];
}

export class ConstraintSolver {
	private state: ConstraintSolverState;

	constructor() {
		this.state = {
			constraints: [],
			unionFind: new UnionFind(),
			substitution: new Map(),
			errors: []
		};
	}

	// Add a constraint to be solved
	addConstraint(constraint: UnificationConstraint): void {
		this.state.constraints.push(constraint);
	}

	// Add multiple constraints
	addConstraints(constraints: UnificationConstraint[]): void {
		this.state.constraints.push(...constraints);
	}

	// Solve all accumulated constraints
	solve(): { success: boolean; substitution: Map<string, Type>; errors: string[] } {
		try {
			this.solveConstraints();
			return {
				success: this.state.errors.length === 0,
				substitution: this.state.substitution,
				errors: this.state.errors
			};
		} catch (error) {
			this.state.errors.push(error instanceof Error ? error.message : String(error));
			return {
				success: false,
				substitution: this.state.substitution,
				errors: this.state.errors
			};
		}
	}

	private solveConstraints(): void {
		// Process constraints until fixed point
		let changed = true;
		let iterations = 0;
		const maxIterations = 100; // Prevent infinite loops

		while (changed && iterations < maxIterations) {
			changed = false;
			iterations++;

			for (let i = 0; i < this.state.constraints.length; i++) {
				const constraint = this.state.constraints[i];
				
				if (this.processConstraint(constraint)) {
					changed = true;
					// Remove processed constraint
					this.state.constraints.splice(i, 1);
					i--; // Adjust index after removal
				}
			}
		}

		if (iterations >= maxIterations) {
			this.state.errors.push("Constraint solving exceeded maximum iterations - possible infinite constraint loop");
		}

		// Check for remaining unsolved constraints
		if (this.state.constraints.length > 0) {
			for (const constraint of this.state.constraints) {
				this.state.errors.push(`Unsolved constraint: ${JSON.stringify(constraint)}`);
			}
		}
	}

	private processConstraint(constraint: UnificationConstraint): boolean {
		switch (constraint.kind) {
			case 'equal':
				return this.processEqualConstraint(constraint.type1, constraint.type2, constraint.location);
			case 'instance':
				return this.processInstanceConstraint(constraint.typeVar, constraint.type, constraint.location);
			case 'check':
				return this.processCheckConstraint(constraint.constraint, constraint.type, constraint.location);
			default:
				this.state.errors.push(`Unknown constraint kind: ${(constraint as any).kind}`);
				return true; // Remove unknown constraints
		}
	}

	private processEqualConstraint(type1: Type, type2: Type, location?: { line: number; column: number }): boolean {
		// Apply current substitution
		const t1 = this.applySubstitution(type1);
		const t2 = this.applySubstitution(type2);

		// If both are the same after substitution, constraint is satisfied
		if (this.typesEqual(t1, t2)) {
			return true; // Remove constraint
		}

		// If both are type variables, unify them
		if (t1.kind === 'variable' && t2.kind === 'variable') {
			this.state.unionFind.union(t1.name, t2.name);
			return true;
		}

		// If one is a type variable, create instance constraint
		if (t1.kind === 'variable') {
			this.addConstraint({ kind: 'instance', typeVar: t1.name, type: t2, location });
			return true;
		}
		if (t2.kind === 'variable') {
			this.addConstraint({ kind: 'instance', typeVar: t2.name, type: t1, location });
			return true;
		}

		// Both are concrete types - decompose structurally
		return this.decomposeTypes(t1, t2, location);
	}

	private processInstanceConstraint(typeVar: string, type: Type, location?: { line: number; column: number }): boolean {
		// Check for occurs check
		if (this.occursIn(typeVar, type)) {
			this.state.errors.push(`Occurs check failed: ${typeVar} occurs in ${this.typeToString(type)}`);
			return true;
		}

		// Apply substitution to type
		const substitutedType = this.applySubstitution(type);

		// Get current substitution for this variable
		const currentSub = this.state.substitution.get(typeVar);
		
		if (currentSub) {
			// If already substituted, add equality constraint to check consistency
			this.addConstraint({ 
				kind: 'equal', 
				type1: currentSub, 
				type2: substitutedType, 
				location 
			});
			return false; // Don't remove constraint yet, let equality be processed
		}

		// Add to substitution
		this.state.substitution.set(typeVar, substitutedType);
		
		// Unify with any other variables in the same equivalence class
		const root = this.state.unionFind.find(typeVar);
		const equivalenceClass = this.state.unionFind.getEquivalenceClasses().get(root) || [];
		
		for (const otherVar of equivalenceClass) {
			if (otherVar !== typeVar) {
				const otherSub = this.state.substitution.get(otherVar);
				if (otherSub) {
					// Check consistency
					this.addConstraint({ 
						kind: 'equal', 
						type1: otherSub, 
						type2: substitutedType, 
						location 
					});
				} else {
					this.state.substitution.set(otherVar, substitutedType);
				}
			}
		}

		return true;
	}

	private processCheckConstraint(constraint: import('../ast').Constraint, type: Type, location?: { line: number; column: number }): boolean {
		// Apply substitution first
		const substitutedType = this.applySubstitution(type);

		// If still a variable, can't check yet
		if (substitutedType.kind === 'variable') {
			return false; // Keep constraint for later
		}

		// Check if concrete type satisfies constraint
		// This would integrate with the existing constraint system
		// For now, just mark as satisfied
		return true;
	}

	private decomposeTypes(type1: Type, type2: Type, location?: { line: number; column: number }): boolean {
		// Must have same kind to unify
		if (type1.kind !== type2.kind) {
			this.state.errors.push(`Type mismatch: cannot unify ${this.typeToString(type1)} with ${this.typeToString(type2)}`);
			return true;
		}

		switch (type1.kind) {
			case 'function':
				if (type2.kind !== 'function') return false;
				
				// Parameter count must match
				if (type1.params.length !== type2.params.length) {
					this.state.errors.push(`Function arity mismatch: ${type1.params.length} vs ${type2.params.length}`);
					return true;
				}

				// Add constraints for parameters and return type
				for (let i = 0; i < type1.params.length; i++) {
					this.addConstraint({ kind: 'equal', type1: type1.params[i], type2: type2.params[i], location });
				}
				this.addConstraint({ kind: 'equal', type1: type1.return, type2: type2.return, location });
				return true;

			case 'list':
				if (type2.kind !== 'list') return false;
				this.addConstraint({ kind: 'equal', type1: type1.element, type2: type2.element, location });
				return true;

			case 'tuple':
				if (type2.kind !== 'tuple') return false;
				
				if (type1.elements.length !== type2.elements.length) {
					this.state.errors.push(`Tuple length mismatch: ${type1.elements.length} vs ${type2.elements.length}`);
					return true;
				}

				for (let i = 0; i < type1.elements.length; i++) {
					this.addConstraint({ kind: 'equal', type1: type1.elements[i], type2: type2.elements[i], location });
				}
				return true;

			case 'record':
				if (type2.kind !== 'record') return false;
				
				const keys1 = Object.keys(type1.fields);
				const keys2 = Object.keys(type2.fields);
				
				// Check all fields exist in both records
				for (const key of keys1) {
					if (!(key in type2.fields)) {
						this.state.errors.push(`Missing field in record: ${key}`);
						return true;
					}
					this.addConstraint({ kind: 'equal', type1: type1.fields[key], type2: type2.fields[key], location });
				}
				
				for (const key of keys2) {
					if (!(key in type1.fields)) {
						this.state.errors.push(`Extra field in record: ${key}`);
						return true;
					}
				}
				return true;

			case 'primitive':
				if (type2.kind !== 'primitive') return false;
				if (type1.name !== type2.name) {
					this.state.errors.push(`Type mismatch: expected ${type1.name} but got ${type2.name}`);
				}
				return true;

			case 'unit':
				return true; // Unit types always unify

			case 'variant':
				if (type2.kind !== 'variant') return false;
				
				if (type1.name !== type2.name) {
					this.state.errors.push(`Variant name mismatch: ${type1.name} vs ${type2.name}`);
					return true;
				}
				
				if (type1.args.length !== type2.args.length) {
					this.state.errors.push(`Variant arity mismatch: ${type1.name} has ${type1.args.length} vs ${type2.args.length} args`);
					return true;
				}

				for (let i = 0; i < type1.args.length; i++) {
					this.addConstraint({ kind: 'equal', type1: type1.args[i], type2: type2.args[i], location });
				}
				return true;

			default:
				this.state.errors.push(`Unknown type kind for decomposition: ${type1.kind}`);
				return true;
		}
	}

	private applySubstitution(type: Type): Type {
		if (type.kind === 'variable') {
			const substitution = this.state.substitution.get(type.name);
			if (substitution) {
				return this.applySubstitution(substitution); // Recursive application
			}
		}
		return type;
	}

	private typesEqual(type1: Type, type2: Type): boolean {
		// Structural equality check
		if (type1.kind !== type2.kind) return false;

		switch (type1.kind) {
			case 'variable':
				return type2.kind === 'variable' && 
					   this.state.unionFind.areUnified(type1.name, type2.name);
			case 'primitive':
				return type2.kind === 'primitive' && type1.name === type2.name;
			case 'unit':
				return type2.kind === 'unit';
			// Add other cases as needed
			default:
				return false;
		}
	}

	private occursIn(typeVar: string, type: Type): boolean {
		switch (type.kind) {
			case 'variable':
				return this.state.unionFind.areUnified(typeVar, type.name);
			case 'function':
				return type.params.some(p => this.occursIn(typeVar, p)) || 
					   this.occursIn(typeVar, type.return);
			case 'list':
				return this.occursIn(typeVar, type.element);
			case 'tuple':
				return type.elements.some(e => this.occursIn(typeVar, e));
			case 'record':
				return Object.values(type.fields).some(f => this.occursIn(typeVar, f));
			case 'variant':
				return type.args.some(a => this.occursIn(typeVar, a));
			default:
				return false;
		}
	}

	private typeToString(type: Type): string {
		// Apply substitution first for better display
		const substituted = this.applySubstitution(type);
		
		switch (substituted.kind) {
			case 'variable':
				return substituted.name;
			case 'primitive':
				return substituted.name;
			case 'unit':
				return 'unit';
			case 'function':
				const params = substituted.params.map(p => this.typeToString(p)).join(', ');
				return `(${params}) -> ${this.typeToString(substituted.return)}`;
			case 'list':
				return `[${this.typeToString(substituted.element)}]`;
			case 'tuple':
				const elements = substituted.elements.map(e => this.typeToString(e)).join(', ');
				return `{${elements}}`;
			case 'record':
				const fields = Object.entries(substituted.fields)
					.map(([key, fieldType]) => `@${key} ${this.typeToString(fieldType)}`)
					.join(', ');
				return `{${fields}}`;
			case 'variant':
				if (substituted.args.length === 0) {
					return substituted.name;
				}
				const args = substituted.args.map(a => this.typeToString(a)).join(' ');
				return `${substituted.name} ${args}`;
			default:
				return `<${substituted.kind}>`;
		}
	}

	// Get the current state for debugging
	getState(): ConstraintSolverState {
		return { ...this.state };
	}

	// Reset solver state
	reset(): void {
		this.state = {
			constraints: [],
			unionFind: new UnionFind(),
			substitution: new Map(),
			errors: []
		};
	}
}