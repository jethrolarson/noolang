/**
 * Test harness for Noolang LSP server.
 * Provides a simple way to start the server and send requests in tests.
 */

import { createConnection, InitializeParams, Connection } from 'vscode-languageserver/node';
import {
	createInMemoryTransportPair,
	InMemoryMessageReader,
	InMemoryMessageWriter,
} from './InMemoryTransport';
import { createTestServer } from './TestServer';

export interface HarnessOptions {
	workspacePath?: string;
	rootUri?: string;
}

/**
 * Wraps the LSP server in a test-friendly interface.
 */
export class LSPServerHarness {
	private readonly clientConnection: Connection;
	private readonly serverConnection: Connection;
	private isInitialized = false;

	constructor(options: HarnessOptions = {}) {
		// Create bidirectional transport pairs
		const { clientReader, clientWriter, serverReader, serverWriter } = createInMemoryTransportPair();

		// Create server connection (handles requests)
		this.serverConnection = createConnection(serverReader, serverWriter);
		// Create client connection (sends requests)
		this.clientConnection = createConnection(clientReader, clientWriter);

		// Setup LSP handlers on the server connection
		createTestServer(this.serverConnection);
	}

	/**
	 * Initialize the server with mock params.
	 */
	async initialize(params?: Partial<InitializeParams>): Promise<void> {
		if (this.isInitialized) {
			throw new Error('Server already initialized');
		}

		const defaultParams: InitializeParams = {
			processId: process.pid,
			rootUri: `file://${process.cwd()}`,
			capabilities: {
				textDocument: {
					completion: {
						completionItem: {
							snippetSupport: true,
						},
					},
				},
			},
			...params,
		};

		// Start listening for messages (server handles incoming requests, client handles responses)
		this.serverConnection.listen();
		this.clientConnection.listen();

		// Small delay to ensure listeners are set up
		await new Promise(resolve => setTimeout(resolve, 50));

		// Send initialize request from client to server
		const result = await this.clientConnection.sendRequest('initialize', defaultParams);
		this.isInitialized = true;

		// Send initialized notification
		await this.clientConnection.sendNotification('initialized', {});
	}

	/**
	 * Open a document in the server.
	 */
	async openDocument(uri: string, languageId: string, content: string, version = 1): Promise<void> {
		await this.clientConnection.sendNotification('textDocument/didOpen', {
			textDocument: {
				uri,
				languageId,
				version,
				text: content,
			},
		});
	}

	/**
	 * Change a document's content.
	 */
	async changeDocument(
		uri: string,
		content: string,
		version: number,
	): Promise<void> {
		await this.clientConnection.sendNotification('textDocument/didChange', {
			textDocument: {
				uri,
				version,
			},
			contentChanges: [
				{
					text: content,
				},
			],
		});
	}

	/**
	 * Request completion at a position.
	 */
	async requestCompletion(
		uri: string,
		line: number,
		character: number,
	): Promise<any> {
		return this.clientConnection.sendRequest('textDocument/completion', {
			textDocument: {
				uri,
			},
			position: {
				line,
				character,
			},
		});
	}

	/**
	 * Request hover at a position.
	 */
	async requestHover(
		uri: string,
		line: number,
		character: number,
	): Promise<any> {
		return this.clientConnection.sendRequest('textDocument/hover', {
			textDocument: {
				uri,
			},
			position: {
				line,
				character,
			},
		});
	}

	/**
	 * Close the harness and cleanup resources.
	 */
	async close(): Promise<void> {
		if (this.isInitialized) {
			try {
				await this.clientConnection.sendNotification('shutdown');
				await this.clientConnection.sendNotification('exit');
			} catch (e) {
				// Ignore errors during shutdown
			}
		}
		this.clientConnection.dispose();
		this.serverConnection.dispose();
		this.isInitialized = false;
	}

	/**
	 * Create a test harness with auto-initialization.
	 */
	static async create(options?: HarnessOptions): Promise<LSPServerHarness> {
		const harness = new LSPServerHarness(options);
		await harness.initialize();
		return harness;
	}
}