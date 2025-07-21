import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
	LanguageClient,
	TransportKind,
	Executable,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	console.log('🎯 Noolang LSP Extension ACTIVATED!');

	// Get the LSP server path from configuration
	const config = workspace.getConfiguration('noolang');
	const serverPath = config.get<string>(
		'languageServerPath',
		'./target/release/noolang-lsp'
	);
	const enableLSP = config.get<boolean>('enableLanguageServer', true);

	if (!enableLSP) {
		console.log('❌ Noolang LSP is disabled');
		return;
	}

	console.log('✅ Noolang LSP is enabled');

	// The server is implemented in Rust
	// Use absolute path to workspace for the LSP binary
	const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
	const serverModule = workspaceFolder
		? path.join(workspaceFolder, serverPath)
		: context.asAbsolutePath(serverPath);

	// Debug logging
	console.log('LSP Debug Info:');
	console.log('  Workspace folder:', workspaceFolder);
	console.log('  Server path config:', serverPath);
	console.log('  Final server module path:', serverModule);
	console.log('  File exists:', require('fs').existsSync(serverModule));

	// The debug options for the server
	const debugOptions = { cwd: context.asAbsolutePath('.') };

	// Server options for binary command
	const serverOptions: { run: Executable; debug: Executable } = {
		run: { command: serverModule, transport: TransportKind.stdio },
		debug: {
			command: serverModule,
			transport: TransportKind.stdio,
			options: debugOptions,
		},
	};

	// Options to control the language client
	const clientOptions = {
		// Register the server for noolang documents
		documentSelector: [{ scheme: 'file', language: 'noolang' }],
		synchronize: {
			// Notify the server about file changes to .noo files in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/*.noo'),
		},
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'Noolang Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	console.log('🚀 Starting LSP client...');
	client.start();
	console.log('✅ LSP client started!');
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
