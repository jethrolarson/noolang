"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    console.log('🎯 Noolang LSP Extension ACTIVATED!');
    // Get the LSP server path from configuration
    const config = vscode_1.workspace.getConfiguration('noolang');
    const enableLSP = config.get('enableLanguageServer', true);
    if (!enableLSP) {
        console.log('❌ Noolang LSP is disabled');
        return;
    }
    console.log('✅ Noolang LSP is enabled');
    const workspaceFolder = vscode_1.workspace.workspaceFolders?.[0]?.uri.fsPath;
    // Compiled TS server entry inside the extension
    const serverJs = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    // Debug logging
    console.log('LSP Debug Info:');
    console.log('  Workspace folder:', workspaceFolder);
    console.log('  Server JS path:', serverJs);
    console.log('  Server JS exists:', require('fs').existsSync(serverJs));
    const env = {
        ...process.env,
        NOOLANG_WORKSPACE: workspaceFolder ?? '',
        NOOLANG_CLI_PATH: workspaceFolder ? path.join(workspaceFolder, 'dist', 'cli.js') : '',
    };
    // The debug options for the server
    const debugOptions = { cwd: context.asAbsolutePath('.'), env };
    // Server options for node script
    const serverOptions = {
        run: { command: 'node', args: [serverJs], transport: node_1.TransportKind.stdio, options: { env } },
        debug: {
            command: 'node',
            args: ['--inspect=6009', serverJs],
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