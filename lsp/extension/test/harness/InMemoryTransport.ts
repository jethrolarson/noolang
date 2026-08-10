/**
 * In-memory LSP transport for testing.
 * Implements MessageReader and MessageWriter from vscode-jsonrpc.
 */

import { MessageReader, MessageWriter, Message } from 'vscode-jsonrpc';
import { Event, Emitter } from 'vscode-jsonrpc';

/**
 * In-memory message queue that connects a reader and writer.
 */
class InMemoryQueue {
	private messages: Message[] = [];
	private callbacks: ((message: Message) => void)[] | null = [];

	public push(message: Message): void {
		if (this.callbacks) {
			// If someone is listening, deliver immediately
			for (const callback of this.callbacks) {
				callback(message);
			}
		} else {
			// Otherwise buffer
			this.messages.push(message);
		}
	}

	public listen(callback: (message: Message) => void): () => void {
		if (!this.callbacks) {
			this.callbacks = [];
		}
		this.callbacks.push(callback);

		// Deliver any buffered messages
		for (const message of this.messages) {
			callback(message);
		}
		this.messages = [];

		// Return unsubscribe function
		return () => {
			this.callbacks = this.callbacks?.filter(cb => cb !== callback) || null;
		};
	}

	public close(): void {
		this.callbacks = null;
		this.messages = [];
	}
}

/**
 * In-memory MessageReader implementation.
 */
export class InMemoryMessageReader implements MessageReader {
	private readonly queue: InMemoryQueue;
	private readonly errorEmitter = new Emitter<Error>();
	private readonly closeEmitter = new Emitter<void>();
	private readonly partialMessageEmitter = new Emitter<any>();
	private unsubscribe: (() => void) | null = null;

	public readonly onError: Event<Error> = this.errorEmitter.event;
	public readonly onClose: Event<void> = this.closeEmitter.event;
	public readonly onPartialMessage: Event<any> = this.partialMessageEmitter.event;

	constructor(queue: InMemoryQueue) {
		this.queue = queue;
	}

	listen(callback: (message: Message) => void): { dispose: () => void } {
		if (this.unsubscribe) {
			throw new Error('Already listening');
		}

		this.unsubscribe = this.queue.listen(callback);
		return { dispose: () => this.dispose() };
	}

	dispose(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.errorEmitter.dispose();
		this.closeEmitter.dispose();
		this.partialMessageEmitter.dispose();
	}

	fireError(error: Error): void {
		this.errorEmitter.fire(error);
	}

	fireClose(): void {
		this.closeEmitter.fire();
	}
}

/**
 * In-memory MessageWriter implementation.
 */
export class InMemoryMessageWriter implements MessageWriter {
	private readonly queue: InMemoryQueue;
	private readonly errorEmitter = new Emitter<[Error, Message | undefined, number | undefined]>();
	private readonly closeEmitter = new Emitter<void>();
	private isClosed = false;
	private writeQueue: Promise<void> = Promise.resolve();

	public readonly onError: Event<[Error, Message | undefined, number | undefined]> = this.errorEmitter.event;
	public readonly onClose: Event<void> = this.closeEmitter.event;

	constructor(queue: InMemoryQueue) {
		this.queue = queue;
	}

	async write(msg: Message): Promise<void> {
		if (this.isClosed) {
			throw new Error('Writer is closed');
		}

		// Ensure writes are ordered
		this.writeQueue = this.writeQueue.then(() => {
			if (this.isClosed) {
				throw new Error('Writer is closed');
			}
			this.queue.push(msg);
		});

		return this.writeQueue;
	}

	end(): void {
		this.isClosed = true;
		this.closeEmitter.fire();
	}

	dispose(): void {
		this.isClosed = true;
		this.errorEmitter.dispose();
		this.closeEmitter.dispose();
	}

	fireError(error: Error, message?: Message, count?: number): void {
		this.errorEmitter.fire([error, message, count]);
	}
}

/**
 * Creates a pair of in-memory reader/writer for bidirectional communication.
 */
export function createInMemoryTransportPair(): {
	clientReader: InMemoryMessageReader;
	clientWriter: InMemoryMessageWriter;
	serverReader: InMemoryMessageReader;
	serverWriter: InMemoryMessageWriter;
} {
	const clientToServer = new InMemoryQueue();
	const serverToClient = new InMemoryQueue();

	return {
		clientReader: new InMemoryMessageReader(serverToClient),
		clientWriter: new InMemoryMessageWriter(clientToServer),
		serverReader: new InMemoryMessageReader(clientToServer),
		serverWriter: new InMemoryMessageWriter(serverToClient),
	};
}