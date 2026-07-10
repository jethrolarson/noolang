/**
 * Module declaration manifest — the soundness core of the module system (Phase 1, Step 1).
 *
 * A `Manifest` is a pure, immutable description of the declarations a module
 * (and its transitive imports) contributes to the global type environment:
 *   - ADT definitions, each tagged with the canonical file path that defines them.
 *   - Trait/constraint definitions, each tagged with their canonical defining path.
 *   - `implement` instances, each tagged with (traitName, typeName, definingPath).
 *
 * `mergeManifests` is a pure set-union-with-conflict-detection:
 *   - Commutative and associative.
 *   - Deduplicates entries that are identical (same key AND same definingPath).
 *   - Hard-errors on genuine conflicts (same logical key, different definingPath).
 *   - Never re-validates instance bodies — trust/dedupe/conflict only.
 *
 * `validateOrphanRule` checks the weak orphan rule separately (can be called after merge).
 *
 * This module contains NO file I/O, NO type inference, and NO AST evaluation.
 * It is intentionally self-contained so it can be unit-tested with synthetic data.
 */

// ─── public types ─────────────────────────────────────────────────────────────

/**
 * A single ADT (variant) definition in a manifest.
 * Identity key: (definingPath, name).
 */
export type ManifestADT = {
	/** The ADT's name, e.g. "Option", "Result". */
	name: string;
	/** Canonical real path of the file that defines this ADT. */
	definingPath: string;
	/** Ordered type parameter names, e.g. ["a"] for Option a. */
	typeParams: string[];
	/**
	 * Constructor name → argument type descriptors.
	 * Stored as an opaque Map; the merge function does NOT inspect or re-validate
	 * the constructor types — it only compares identity keys.
	 */
	constructors: Map<string, unknown[]>;
};

/**
 * A single `implement <Trait> <Type>` instance in a manifest.
 * Identity key: (traitName, typeName).
 * Dedup key: (traitName, typeName, definingPath) — same triple is a harmless diamond.
 * Conflict: same (traitName, typeName) with two different definingPaths.
 */
export type ManifestInstance = {
	traitName: string;
	typeName: string;
	/** Canonical real path of the file that defines this instance. */
	definingPath: string;
};

/**
 * A single trait/constraint definition in a manifest.
 * Identity key: (definingPath, name).
 * Conflict: same name, different definingPath.
 */
export type ManifestTraitDef = {
	name: string;
	definingPath: string;
};

/**
 * The full declaration manifest for a module (and its transitive imports).
 * Invariant: no two entries share the same identity key with different definingPaths.
 */
export type Manifest = {
	adts: ManifestADT[];
	instances: ManifestInstance[];
	traitDefs: ManifestTraitDef[];
};

// ─── constructors ─────────────────────────────────────────────────────────────

/** The empty manifest — identity element for mergeManifests. */
export function emptyManifest(): Manifest {
	return { adts: [], instances: [], traitDefs: [] };
}

// ─── merge ────────────────────────────────────────────────────────────────────

/**
 * Pure merge of two manifests.
 *
 * Properties:
 *   - Commutative: mergeManifests(a, b) ≡ mergeManifests(b, a) (same logical result).
 *   - Associative: mergeManifests(mergeManifests(a,b), c) ≡ mergeManifests(a, mergeManifests(b,c)).
 *   - Conflict errors name BOTH conflicting paths, regardless of argument order.
 *   - Never re-validates instance bodies.
 *
 * Throws a descriptive Error on:
 *   - Two instances with the same (traitName, typeName) but different definingPaths.
 *   - Two ADTs with the same name but different definingPaths.
 *   - Two trait definitions with the same name but different definingPaths.
 */
export function mergeManifests(a: Manifest, b: Manifest): Manifest {
	return {
		adts: mergeADTs(a.adts, b.adts),
		instances: mergeInstances(a.instances, b.instances),
		traitDefs: mergeTraitDefs(a.traitDefs, b.traitDefs),
	};
}

// ─── merge helpers ────────────────────────────────────────────────────────────

function mergeInstances(
	as: ManifestInstance[],
	bs: ManifestInstance[]
): ManifestInstance[] {
	// Map keyed by "traitName\0typeName" → { definingPath, entry }
	// Using a canonical separator that cannot appear in valid paths/names.
	const seen = new Map<string, ManifestInstance>();

	const add = (inst: ManifestInstance): void => {
		const key = `${inst.traitName}\0${inst.typeName}`;
		const existing = seen.get(key);
		if (existing === undefined) {
			seen.set(key, inst);
		} else if (existing.definingPath === inst.definingPath) {
			// Same (trait, type, path) — harmless diamond, dedupe silently.
		} else {
			// Same (trait, type), different paths — coherence conflict.
			// Collect BOTH paths in the error, sorted so the message is
			// deterministic regardless of argument order to mergeManifests.
			const [pathA, pathB] = [existing.definingPath, inst.definingPath].sort();
			throw new Error(
				`Trait coherence conflict: both '${pathA}' and '${pathB}' define` +
					` an instance of ${inst.traitName} for ${inst.typeName}.` +
					` Only one implementation per (trait, type) pair is allowed.`
			);
		}
	};

	for (const inst of as) add(inst);
	for (const inst of bs) add(inst);

	return Array.from(seen.values());
}

function mergeADTs(as: ManifestADT[], bs: ManifestADT[]): ManifestADT[] {
	// Key: "name" only — same name, different path is a conflict.
	// Same name, same path is a dedupe.
	const seen = new Map<string, ManifestADT>();

	const add = (adt: ManifestADT): void => {
		const existing = seen.get(adt.name);
		if (existing === undefined) {
			seen.set(adt.name, adt);
		} else if (existing.definingPath === adt.definingPath) {
			// Same (path, name) — dedupe silently.
		} else {
			const [pathA, pathB] = [existing.definingPath, adt.definingPath].sort();
			throw new Error(
				`ADT identity conflict: both '${pathA}' and '${pathB}' define` +
					` a type named '${adt.name}'.` +
					` Qualified coexistence is a Phase-3 namespacing feature.`
			);
		}
	};

	for (const adt of as) add(adt);
	for (const adt of bs) add(adt);

	return Array.from(seen.values());
}

function mergeTraitDefs(
	as: ManifestTraitDef[],
	bs: ManifestTraitDef[]
): ManifestTraitDef[] {
	const seen = new Map<string, ManifestTraitDef>();

	const add = (td: ManifestTraitDef): void => {
		const existing = seen.get(td.name);
		if (existing === undefined) {
			seen.set(td.name, td);
		} else if (existing.definingPath === td.definingPath) {
			// Same (path, name) — dedupe silently.
		} else {
			const [pathA, pathB] = [existing.definingPath, td.definingPath].sort();
			throw new Error(
				`Trait definition conflict: both '${pathA}' and '${pathB}' define` +
					` a trait named '${td.name}'.`
			);
		}
	};

	for (const td of as) add(td);
	for (const td of bs) add(td);

	return Array.from(seen.values());
}

// ─── orphan rule ──────────────────────────────────────────────────────────────

/**
 * Validates the weak orphan rule across a (merged) manifest.
 *
 * Rule: an `implement Trait Type` instance must be defined in the same file as
 * EITHER the trait definition OR the type (ADT) definition.
 *
 * Coherence unit exception: if all of (instance, traitDef, and ADT/type) have
 * paths starting with "std/", they are treated as one coherence unit and no
 * orphan error is raised. This lets stdlib modules implement traits/types from
 * other stdlib modules.
 *
 * For primitive types (Float, String, Int, …) that have no ADT entry in the
 * manifest, only the trait-co-location check applies.
 *
 * Throws with a message naming the offending instance's definingPath.
 *
 * Deferral note: the orphan rule for instances whose trait is not yet in the
 * manifest (e.g. the trait comes from a separate import not yet merged) cannot
 * be checked here. Callers must ensure the manifest is fully merged before
 * calling this function.
 */
export function validateOrphanRule(manifest: Manifest): void {
	const traitDefPaths = new Map<string, string>(); // traitName → definingPath
	for (const td of manifest.traitDefs) {
		traitDefPaths.set(td.name, td.definingPath);
	}

	const adtDefPaths = new Map<string, string>(); // typeName → definingPath
	for (const adt of manifest.adts) {
		adtDefPaths.set(adt.name, adt.definingPath);
	}

	for (const inst of manifest.instances) {
		const traitPath = traitDefPaths.get(inst.traitName);
		const typePath = adtDefPaths.get(inst.typeName);

		if (isOrphan(inst.definingPath, traitPath, typePath)) {
			throw new Error(
				`Orphan instance: '${inst.definingPath}' defines` +
					` \`implement ${inst.traitName} ${inst.typeName}\`` +
					` but is not co-located with either the trait definition` +
					(traitPath ? ` ('${traitPath}')` : ' (trait not in manifest)') +
					` or the type definition` +
					(typePath ? ` ('${typePath}')` : ' (primitive or not in manifest)') +
					`. Move the instance to one of those files.`
			);
		}
	}
}

/**
 * Returns true if the instance at `instPath` is an orphan given where the
 * trait and type are defined.
 *
 * Not an orphan if:
 *   1. Instance is co-located with the trait (instPath === traitPath).
 *   2. Instance is co-located with the type (instPath === typePath).
 *   3. All of instance, trait, and type are in the std/* coherence unit.
 *      (For primitives with no typePath, std coherence only applies if both
 *       instance and trait are in std/*.)
 */
function isOrphan(
	instPath: string,
	traitPath: string | undefined,
	typePath: string | undefined
): boolean {
	// Co-located with the trait
	if (traitPath !== undefined && instPath === traitPath) return false;

	// Co-located with the type
	if (typePath !== undefined && instPath === typePath) return false;

	// Std coherence unit: instance is std AND (trait is std OR type is std)
	if (
		isStdPath(instPath) &&
		((traitPath !== undefined && isStdPath(traitPath)) ||
			(typePath !== undefined && isStdPath(typePath)))
	) {
		return false;
	}

	return true;
}

/**
 * Returns true if the path belongs to the std/* coherence unit.
 * A path is "std" if it starts with "std/" (relative) or contains "/std/"
 * as a directory component. This covers both the test convention (`std/foo.noo`)
 * and real absolute paths (`.../stdlib/std/foo.noo`).
 *
 * Judgment call: the spec says "treat all of std/* as one coherence unit" but
 * does not define what "std/*" means in terms of file paths. We use a liberal
 * heuristic: any path component named "std" qualifies. If the stdlib ever moves,
 * callers can pass normalised paths.
 */
function isStdPath(path: string): boolean {
	return path.startsWith('std/') || path.includes('/std/');
}
