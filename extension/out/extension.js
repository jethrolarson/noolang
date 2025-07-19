"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    console.log('🎯 Noolang LSP Extension ACTIVATED!');
    // Get the LSP server path from configuration
    const config = vscode_1.workspace.getConfiguration('noolang');
    const serverPath = config.get('languageServerPath', './lsp/target/release/noolang-lsp');
    const enableLSP = config.get('enableLanguageServer', true);
    if (!enableLSP) {
        console.log('❌ Noolang LSP is disabled');
        return;
    }
    console.log('✅ Noolang LSP is enabled');
    // The server is implemented in Rust
    // Use absolute path to workspace for the LSP binary
    const workspaceFolder = vscode_1.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
    const serverOptions = {
        run: { command: serverModule, transport: node_1.TransportKind.stdio },
        debug: {
            command: serverModule,
            transport: node_1.TransportKind.stdio,
            options: debugOptions,
        },
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for noolang documents
        documentSelector: [{ scheme: 'file', language: 'noolang' }],
        synchronize: {
            // Notify the server about file changes to .noo files in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.noo'),
        },
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient('Noolang Language Server', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    console.log('🚀 Starting LSP client...');
    client.start();
    console.log('✅ LSP client started!');
}
exports.activate = activate;
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map