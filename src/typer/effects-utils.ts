import type { Effect } from '../ast';

// Helper: Format effects as string for type display
export function formatEffectsString(effects: Set<Effect>): string {
	if (effects.size === 0) return '';
	return ` ${Array.from(effects)
		.map(e => `!${e}`)
		.join(' ')}`;
}
