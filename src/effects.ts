// Placeholder for effect handling in Noolang
// This will be implemented in future versions

export type IOEffect = {
	kind: "IO";
	action: string;
	data?: unknown;
};

export type StateEffect = {
	kind: "State";
	action: "get" | "set";
	key?: string;
	value?: unknown;
};

export type ErrorEffect = {
	kind: "Error";
	message: string;
};

export type Effect = IOEffect | StateEffect | ErrorEffect;

export interface EffectHandler {
	handle(effect: Effect): Promise<unknown>;
}

export class EffectManager {
	private handlers: Map<string, EffectHandler> = new Map();

	registerHandler(effectType: string, handler: EffectHandler): void {
		this.handlers.set(effectType, handler);
	}

	async handleEffect(effect: Effect): Promise<unknown> {
		const handler = this.handlers.get(effect.kind);
		if (handler) {
			return await handler.handle(effect);
		}
		throw new Error(`No handler registered for effect type: ${effect.kind}`);
	}
}

// Default effect handlers (placeholders)
export class DefaultIOHandler implements EffectHandler {
	async handle(effect: Effect): Promise<unknown> {
		if (effect.kind === "IO") {
			console.log(`IO Effect: ${effect.action}`, effect.data);
			return null;
		}
		throw new Error(`Unsupported effect: ${effect.kind}`);
	}
}

export class DefaultStateHandler implements EffectHandler {
	private state: Map<string, unknown> = new Map();

	async handle(effect: Effect): Promise<unknown> {
		if (effect.kind === "State") {
			if (effect.action === "get" && effect.key) {
				return this.state.get(effect.key);
			} else if (effect.action === "set" && effect.key) {
				this.state.set(effect.key, effect.value);
				return null;
			}
		}
		throw new Error(`Unsupported effect: ${effect.kind}`);
	}
}