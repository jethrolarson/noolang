/**
 * Tests for the module declaration manifest + merge primitive (Phase 1, Step 1).
 *
 * All manifests are constructed in-memory — no file I/O, no resolution.
 * The fail-closed tests (conflict/orphan) are the point: they must be red
 * before the merge logic exists, and green after.
 */

import { describe, test, expect } from 'bun:test';
import {
	type Manifest,
	type ManifestADT,
	type ManifestInstance,
	type ManifestTraitDef,
	emptyManifest,
	mergeManifests,
	validateOrphanRule,
} from '../module-manifest';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mkInstance(
	traitName: string,
	typeName: string,
	definingPath: string
): ManifestInstance {
	return { traitName, typeName, definingPath };
}

function mkADT(name: string, definingPath: string): ManifestADT {
	return { name, definingPath, typeParams: [], constructors: new Map() };
}

function mkTraitDef(name: string, definingPath: string): ManifestTraitDef {
	return { name, definingPath };
}

function mkManifest(
	adts: ManifestADT[] = [],
	instances: ManifestInstance[] = [],
	traitDefs: ManifestTraitDef[] = []
): Manifest {
	return { adts, instances, traitDefs };
}

// ─── instance dedup ───────────────────────────────────────────────────────────

describe('mergeManifests — instance dedup', () => {
	test('same (trait, type, definingPath) merged twice → one entry, no error', () => {
		const inst = mkInstance('Eq', 'String', '/lib/eq_string.noo');
		const a = mkManifest([], [inst]);
		const b = mkManifest([], [inst]);
		const result = mergeManifests(a, b);
		expect(result.instances).toHaveLength(1);
		expect(result.instances[0]).toEqual(inst);
	});

	test('different (trait, type) pair — both kept', () => {
		const a = mkManifest([], [mkInstance('Eq', 'String', '/lib/eq.noo')]);
		const b = mkManifest([], [mkInstance('Ord', 'String', '/lib/ord.noo')]);
		const result = mergeManifests(a, b);
		expect(result.instances).toHaveLength(2);
	});

	test('same trait, different type — both kept', () => {
		const a = mkManifest([], [mkInstance('Eq', 'String', '/lib/eq.noo')]);
		const b = mkManifest([], [mkInstance('Eq', 'Float', '/lib/eq.noo')]);
		const result = mergeManifests(a, b);
		expect(result.instances).toHaveLength(2);
	});
});

// ─── instance conflict (fail-closed) ─────────────────────────────────────────

describe('mergeManifests — instance conflict (fail-closed)', () => {
	test('same (trait, type), two different definingPaths → throws', () => {
		const a = mkManifest([], [mkInstance('Eq', 'String', '/moduleA/lib.noo')]);
		const b = mkManifest([], [mkInstance('Eq', 'String', '/moduleB/lib.noo')]);
		expect(() => mergeManifests(a, b)).toThrow();
	});

	test('conflict error names BOTH files', () => {
		const pathA = '/moduleA/lib.noo';
		const pathB = '/moduleB/lib.noo';
		const a = mkManifest([], [mkInstance('Eq', 'String', pathA)]);
		const b = mkManifest([], [mkInstance('Eq', 'String', pathB)]);
		let msg = '';
		try {
			mergeManifests(a, b);
		} catch (e) {
			msg = (e as Error).message;
		}
		expect(msg).toContain(pathA);
		expect(msg).toContain(pathB);
	});

	test('conflict is order-independent (merge(a,b) and merge(b,a) both throw)', () => {
		const pathA = '/moduleA/lib.noo';
		const pathB = '/moduleB/lib.noo';
		const a = mkManifest([], [mkInstance('Eq', 'String', pathA)]);
		const b = mkManifest([], [mkInstance('Eq', 'String', pathB)]);
		expect(() => mergeManifests(a, b)).toThrow();
		expect(() => mergeManifests(b, a)).toThrow();
	});

	test('conflict message names both files regardless of order', () => {
		const pathA = '/moduleA/lib.noo';
		const pathB = '/moduleB/lib.noo';
		const a = mkManifest([], [mkInstance('Functor', 'List', pathA)]);
		const b = mkManifest([], [mkInstance('Functor', 'List', pathB)]);

		let msgAB = '';
		let msgBA = '';
		try { mergeManifests(a, b); } catch (e) { msgAB = (e as Error).message; }
		try { mergeManifests(b, a); } catch (e) { msgBA = (e as Error).message; }

		// Both orders name both files
		expect(msgAB).toContain(pathA);
		expect(msgAB).toContain(pathB);
		expect(msgBA).toContain(pathA);
		expect(msgBA).toContain(pathB);
	});
});

// ─── ADT dedup ────────────────────────────────────────────────────────────────

describe('mergeManifests — ADT dedup', () => {
	test('same (definingPath, name) merged twice → one entry', () => {
		const adt = mkADT('Option', '/std/option.noo');
		const a = mkManifest([adt]);
		const b = mkManifest([adt]);
		const result = mergeManifests(a, b);
		expect(result.adts).toHaveLength(1);
	});

	test('different name same path — both kept', () => {
		const a = mkManifest([mkADT('Option', '/std/prelude.noo')]);
		const b = mkManifest([mkADT('Result', '/std/prelude.noo')]);
		const result = mergeManifests(a, b);
		expect(result.adts).toHaveLength(2);
	});

	test('same name same path — dedupe (exact same entry, no error)', () => {
		const adt = mkADT('Box', '/lib/box.noo');
		const a = mkManifest([adt]);
		const b = mkManifest([adt]);
		const result = mergeManifests(a, b);
		expect(result.adts).toHaveLength(1);
	});
});

// ─── ADT collision (fail-closed) ──────────────────────────────────────────────

describe('mergeManifests — ADT collision (fail-closed)', () => {
	test('same name, different definingPath → throws', () => {
		const a = mkManifest([mkADT('Box', '/moduleA/types.noo')]);
		const b = mkManifest([mkADT('Box', '/moduleB/types.noo')]);
		expect(() => mergeManifests(a, b)).toThrow();
	});

	test('ADT collision error names both files', () => {
		const pathA = '/moduleA/types.noo';
		const pathB = '/moduleB/types.noo';
		const a = mkManifest([mkADT('Box', pathA)]);
		const b = mkManifest([mkADT('Box', pathB)]);
		let msg = '';
		try { mergeManifests(a, b); } catch (e) { msg = (e as Error).message; }
		expect(msg).toContain(pathA);
		expect(msg).toContain(pathB);
	});

	test('ADT collision is order-independent', () => {
		const a = mkManifest([mkADT('Tree', '/moduleA/tree.noo')]);
		const b = mkManifest([mkADT('Tree', '/moduleB/tree.noo')]);
		expect(() => mergeManifests(a, b)).toThrow();
		expect(() => mergeManifests(b, a)).toThrow();
	});
});

// ─── trait definition dedup & collision ───────────────────────────────────────

describe('mergeManifests — trait definition dedup & collision', () => {
	test('same (definingPath, name) merged twice → one entry', () => {
		const td = mkTraitDef('Eq', '/std/eq.noo');
		const a = mkManifest([], [], [td]);
		const b = mkManifest([], [], [td]);
		const result = mergeManifests(a, b);
		expect(result.traitDefs).toHaveLength(1);
	});

	test('same name, different definingPath → throws', () => {
		const a = mkManifest([], [], [mkTraitDef('Eq', '/moduleA/eq.noo')]);
		const b = mkManifest([], [], [mkTraitDef('Eq', '/moduleB/eq.noo')]);
		expect(() => mergeManifests(a, b)).toThrow();
	});

	test('trait def collision error names both files', () => {
		const pathA = '/moduleA/eq.noo';
		const pathB = '/moduleB/eq.noo';
		const a = mkManifest([], [], [mkTraitDef('Eq', pathA)]);
		const b = mkManifest([], [], [mkTraitDef('Eq', pathB)]);
		let msg = '';
		try { mergeManifests(a, b); } catch (e) { msg = (e as Error).message; }
		expect(msg).toContain(pathA);
		expect(msg).toContain(pathB);
	});
});

// ─── commutativity & associativity ───────────────────────────────────────────

describe('mergeManifests — commutativity & associativity', () => {
	test('merge(a,b) and merge(b,a) yield same result (commutativity)', () => {
		const a = mkManifest(
			[mkADT('Option', '/std/option.noo')],
			[mkInstance('Eq', 'String', '/std/eq.noo')],
			[mkTraitDef('Eq', '/std/eq.noo')]
		);
		const b = mkManifest(
			[mkADT('Result', '/std/result.noo')],
			[mkInstance('Eq', 'Float', '/std/eq.noo')],
			[mkTraitDef('Ord', '/std/ord.noo')]
		);
		const ab = mergeManifests(a, b);
		const ba = mergeManifests(b, a);

		// Same counts
		expect(ab.adts).toHaveLength(ba.adts.length);
		expect(ab.instances).toHaveLength(ba.instances.length);
		expect(ab.traitDefs).toHaveLength(ba.traitDefs.length);

		// Same names (order may differ, so sort)
		const adtNamesAB = ab.adts.map(x => x.name).sort();
		const adtNamesBA = ba.adts.map(x => x.name).sort();
		expect(adtNamesAB).toEqual(adtNamesBA);

		const instKeysAB = ab.instances.map(x => `${x.traitName}:${x.typeName}`).sort();
		const instKeysBA = ba.instances.map(x => `${x.traitName}:${x.typeName}`).sort();
		expect(instKeysAB).toEqual(instKeysBA);
	});

	test('associativity: merge(merge(a,b),c) ≡ merge(a,merge(b,c))', () => {
		const a = mkManifest(
			[mkADT('Option', '/std/option.noo')],
			[mkInstance('Eq', 'String', '/std/eq.noo')]
		);
		const b = mkManifest(
			[mkADT('Result', '/std/result.noo')],
			[mkInstance('Ord', 'Float', '/std/ord.noo')]
		);
		const c = mkManifest(
			[mkADT('List', '/std/list.noo')],
			[mkInstance('Functor', 'List', '/std/functor.noo')]
		);

		const abc_left = mergeManifests(mergeManifests(a, b), c);
		const abc_right = mergeManifests(a, mergeManifests(b, c));

		const sortADTs = (m: Manifest) => m.adts.map(x => x.name).sort();
		const sortInsts = (m: Manifest) =>
			m.instances.map(x => `${x.traitName}:${x.typeName}`).sort();

		expect(sortADTs(abc_left)).toEqual(sortADTs(abc_right));
		expect(sortInsts(abc_left)).toEqual(sortInsts(abc_right));
	});

	test('conflict detected regardless of order — associativity holds for errors too', () => {
		const pathA = '/moduleA/lib.noo';
		const pathB = '/moduleB/lib.noo';
		const a = mkManifest([], [mkInstance('Eq', 'String', pathA)]);
		const b = mkManifest([], [mkInstance('Eq', 'String', pathB)]);
		const c = mkManifest([], [mkInstance('Ord', 'Float', '/std/ord.noo')]);

		// merge(a,b) throws; thus merge(merge(a,b),c) throws
		expect(() => mergeManifests(mergeManifests(a, b), c)).toThrow();
		// merge(b,a) throws; thus merge(a,merge(b,a)) — can't use due to inner throw
		// Instead: the two different conflict-detecting merge calls both throw
		expect(() => mergeManifests(a, b)).toThrow();
		expect(() => mergeManifests(b, a)).toThrow();
	});
});

// ─── empty manifest identity ──────────────────────────────────────────────────

describe('mergeManifests — empty manifest', () => {
	test('merge(empty, a) === a', () => {
		const a = mkManifest(
			[mkADT('Option', '/std/option.noo')],
			[mkInstance('Eq', 'String', '/std/eq.noo')],
			[mkTraitDef('Eq', '/std/eq.noo')]
		);
		const result = mergeManifests(emptyManifest(), a);
		expect(result.adts).toHaveLength(1);
		expect(result.instances).toHaveLength(1);
		expect(result.traitDefs).toHaveLength(1);
	});

	test('merge(a, empty) === a', () => {
		const a = mkManifest(
			[mkADT('Option', '/std/option.noo')],
			[mkInstance('Eq', 'String', '/std/eq.noo')]
		);
		const result = mergeManifests(a, emptyManifest());
		expect(result.adts).toHaveLength(1);
		expect(result.instances).toHaveLength(1);
	});
});

// ─── orphan rule ──────────────────────────────────────────────────────────────

describe('validateOrphanRule', () => {
	test('instance co-located with trait → NOT orphan', () => {
		// Eq defined in /lib/eq.noo; instance of Eq for UserType also in /lib/eq.noo
		const manifest = mkManifest(
			[mkADT('UserType', '/app/types.noo')],
			[mkInstance('Eq', 'UserType', '/lib/eq.noo')],
			[mkTraitDef('Eq', '/lib/eq.noo')]
		);
		expect(() => validateOrphanRule(manifest)).not.toThrow();
	});

	test('instance co-located with type → NOT orphan', () => {
		// Eq defined elsewhere; instance of Eq for MyType in same file as MyType
		const manifest = mkManifest(
			[mkADT('MyType', '/app/mytype.noo')],
			[mkInstance('Eq', 'MyType', '/app/mytype.noo')],
			[mkTraitDef('Eq', '/std/eq.noo')]
		);
		expect(() => validateOrphanRule(manifest)).not.toThrow();
	});

	test('std/* instance for another std/* trait/type → NOT orphan (coherence unit)', () => {
		// Instance in std/list_instances.noo for trait Functor in std/functor.noo
		// and type List in std/list.noo — all std, no orphan
		const manifest = mkManifest(
			[mkADT('List', 'std/list.noo')],
			[mkInstance('Functor', 'List', 'std/list_instances.noo')],
			[mkTraitDef('Functor', 'std/functor.noo')]
		);
		expect(() => validateOrphanRule(manifest)).not.toThrow();
	});

	test('orphan instance (neither with trait nor type, not std) → throws (fail-closed)', () => {
		// Eq defined in std/; List defined in std/; but instance in /userApp/orphan.noo
		const manifest = mkManifest(
			[mkADT('List', 'std/list.noo')],
			[mkInstance('Eq', 'List', '/userApp/orphan.noo')],
			[mkTraitDef('Eq', 'std/eq.noo')]
		);
		expect(() => validateOrphanRule(manifest)).toThrow();
	});

	test('orphan error message names the instance defining path', () => {
		const orphanPath = '/userApp/orphan.noo';
		const manifest = mkManifest(
			[mkADT('List', 'std/list.noo')],
			[mkInstance('Eq', 'List', orphanPath)],
			[mkTraitDef('Eq', 'std/eq.noo')]
		);
		let msg = '';
		try { validateOrphanRule(manifest); } catch (e) { msg = (e as Error).message; }
		expect(msg).toContain(orphanPath);
	});

	test('instance for unknown type (primitive) is only checked against trait location', () => {
		// Float is a primitive — no ADT entry. Instance in std/eq.noo with trait Eq also in std/eq.noo → ok
		const manifest = mkManifest(
			[],
			[mkInstance('Eq', 'Float', 'std/eq.noo')],
			[mkTraitDef('Eq', 'std/eq.noo')]
		);
		expect(() => validateOrphanRule(manifest)).not.toThrow();
	});

	test('instance for unknown type, not with trait → orphan (fail-closed)', () => {
		// Float is a primitive (no ADT), instance in /userApp/extra.noo, trait in std/
		const manifest = mkManifest(
			[],
			[mkInstance('Eq', 'Float', '/userApp/extra.noo')],
			[mkTraitDef('Eq', 'std/eq.noo')]
		);
		expect(() => validateOrphanRule(manifest)).toThrow();
	});
});

// ─── diamond dedup (no false duplicate errors) ────────────────────────────────

describe('mergeManifests — diamond pattern (A→B→D, A→C→D)', () => {
	test('D defines instance; merging via both paths gives one entry, no error', () => {
		// D's manifest appears in both B and C (via transitive merge)
		const dManifest = mkManifest(
			[mkADT('Token', '/d/types.noo')],
			[mkInstance('Eq', 'Token', '/d/types.noo')],
			[mkTraitDef('Eq', '/d/eq.noo')]
		);

		// B has its own + D's
		const bManifest = mergeManifests(
			mkManifest([], [mkInstance('Ord', 'Int', '/b/ord.noo')]),
			dManifest
		);

		// C has its own + D's
		const cManifest = mergeManifests(
			mkManifest([], [mkInstance('Show', 'Bool', '/c/show.noo')]),
			dManifest
		);

		// A merges B and C — D's declarations should dedupe, not conflict
		expect(() => mergeManifests(bManifest, cManifest)).not.toThrow();
		const aManifest = mergeManifests(bManifest, cManifest);

		// D's ADT and instance each appear exactly once
		expect(aManifest.adts.filter(x => x.name === 'Token')).toHaveLength(1);
		expect(
			aManifest.instances.filter(
				x => x.traitName === 'Eq' && x.typeName === 'Token'
			)
		).toHaveLength(1);
	});
});
