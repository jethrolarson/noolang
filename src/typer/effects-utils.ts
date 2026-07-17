import type { Effect, Type } from '../ast';

// Helper: Format effects as string for type display
export function formatEffectsString(effects: Set<Effect>): string {
	if (effects.size === 0) return '';
	return ` ${Array.from(effects)
		.map(e => `!${e}`)
		.join(' ')}`;
}

// True when a type contains no type variables — i.e. it was written down
// rather than inferred fresh. Effect sets carry no polymorphism marker, so an
// empty set on an inferred function type means "unconstrained" while on a
// concrete one it means "declared pure"; only the latter is enforceable.
export const isFullyConcrete = (type: Type): boolean => {
	switch (type.kind) {
		case 'variable':
			return false;
		case 'function':
			return type.params.every(isFullyConcrete) && isFullyConcrete(type.return);
		case 'list':
			return isFullyConcrete(type.element);
		case 'variant':
			return type.args.every(isFullyConcrete);
		case 'tuple':
			return type.elements.every(isFullyConcrete);
		default:
			return true;
	}
};

// Collect the latent effects along a (possibly curried) function type's spine.
export const collectSpineEffects = (type: Type): Set<Effect> => {
	const effects = new Set<Effect>();
	let t: Type = type;
	while (t.kind === 'function') {
		if (t.effects) for (const e of t.effects) effects.add(e);
		t = t.return;
	}
	return effects;
};
