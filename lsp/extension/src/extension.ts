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
	const enableLSP = config.get<boolean>('enableLanguageServer', true);

	if (!enableLSP) {
		console.log('❌ Noolang LSP is disabled');
		return;
	}

	console.log('✅ Noolang LSP is enabled');

	const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
	// Compiled TS server entry inside the extension
	const serverJs = context.asAbsolutePath(path.join('out', 'server', 'server.js'));

	// Debug logging
	console.log('LSP Debug Info:');
	console.log('  Workspace folder:', workspaceFolder);
	console.log('  Server JS path:', serverJs);
	console.log('  Server JS exists:', require('fs').existsSync(serverJs));

	// Prefer the live TypeScript CLI (via bun) over the built dist/cli.js —
	// a stale dist means every diagnostic reflects an old version of the
	// language. dist remains the fallback for workspaces without source.
	const fs = require('fs') as typeof import('fs');
	const srcCli = workspaceFolder ? path.join(workspaceFolder, 'src', 'cli.ts') : '';
	const distCli = workspaceFolder ? path.join(workspaceFolder, 'dist', 'cli.js') : '';
	const cliPath = srcCli && fs.existsSync(srcCli) ? srcCli : distCli;
	// GUI-launched VS Code often lacks the shell PATH; resolve bun directly
	const bunCandidates = [
		path.join(process.env.HOME ?? '', '.bun', 'bin', 'bun'),
		'/opt/homebrew/bin/bun',
		'/usr/local/bin/bun',
	];
	const bunPath = bunCandidates.find(c => fs.existsSync(c)) ?? 'bun';

	const env = {
		...process.env,
		NOOLANG_WORKSPACE: workspaceFolder ?? '',
		NOOLANG_CLI_PATH: cliPath,
		NOOLANG_CLI_RUNTIME: cliPath.endsWith('.ts') ? bunPath : 'node',
	};

	// The debug options for the server
	const debugOptions = { cwd: context.asAbsolutePath('.'), env };

	// Server options for node script
	const serverOptions: { run: Executable; debug: Executable } = {
		run: { command: 'node', args: [serverJs], transport: TransportKind.stdio, options: { env } },
		debug: {
			command: 'node',
			args: ['--inspect=6009', serverJs],
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
