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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_uri_1 = require("vscode-uri");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Very simple in-memory document store (FULL sync)
const documents = new Map(); // key: uri
// Env from client
const WORKSPACE = process.env.NOOLANG_WORKSPACE || '';
const CLI_PATH = process.env.NOOLANG_CLI_PATH || path.join(WORKSPACE || '.', 'dist', 'cli.js');
function uriToFilePath(uri) {
    try {
        return vscode_uri_1.URI.parse(uri).fsPath;
    }
    catch {
        return undefined;
    }
}
function runNodeCli(args) {
    return (0, child_process_1.spawnSync)('node', [CLI_PATH, ...args], { encoding: 'utf8' });
}
// --- Bridge helpers (ported from Rust logic) ---
function parseTypesOutput(output) {
    const types = [];
    let inTypes = false;
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === 'Types:') {
            inTypes = true;
            continue;
        }
        if (inTypes) {
            if (!trimmed) {
                inTypes = false;
                continue;
            }
            const idx = trimmed.indexOf(':');
            if (idx >= 0 && idx + 1 < trimmed.length) {
                const typeInfo = trimmed.slice(idx + 1).trim();
                if (typeInfo)
                    types.push(typeInfo);
            }
        }
    }
    return types;
}
function cleanErrorMessage(line) {
    let message = line;
    const prefixes = ['Error:', 'TypeError:', 'Parse error:'];
    for (const p of prefixes) {
        const idx = message.indexOf(p);
        if (idx >= 0) {
            message = message.slice(idx);
            break;
        }
    }
    message = message.replace(/\s+at line \d+(?:, column \d+)?/g, '');
    return message.trim();
}
function extractLineColumn(line) {
    // Pattern 1: at line X, column Y
    const m1 = /line\s+(\d+)\s*,\s*column\s*(\d+)/.exec(line);
    if (m1)
        return { line: Number(m1[1]), column: Number(m1[2]) };
    // Pattern 2: X:Y or lineX:Y
    const parts = line.split(/\s+/);
    for (const part of parts) {
        const idx = part.indexOf(':');
        if (idx > 0) {
            const left = part.slice(0, idx).replace(/^\D+/, '');
            const right = part.slice(idx + 1).replace(/\D+$/, '');
            if (left && right && /^\d+$/.test(left) && /^\d+$/.test(right)) {
                return { line: Number(left), column: Number(right) };
            }
        }
    }
    // Pattern 3: Parse error at line X
    const m3 = /at line\s+(\d+)/.exec(line);
    if (m3)
        return { line: Number(m3[1]), column: 1 };
    return undefined;
}
function getDiagnostics(filePath) {
    const result = runNodeCli(['--types-file', filePath]);
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const diags = [];
    const processLine = (line) => {
        if (!line)
            return;
        if (/(Error|TypeError|Parse error)/.test(line)) {
            const loc = extractLineColumn(line);
            const message = cleanErrorMessage(line);
            const sev = /warning/i.test(line)
                ? node_1.DiagnosticSeverity.Warning
                : /info/i.test(line)
                    ? node_1.DiagnosticSeverity.Information
                    : node_1.DiagnosticSeverity.Error;
            const l = (loc?.line ?? 1) - 1; // 0-based
            const c = (loc?.column ?? 1) - 1;
            diags.push({
                range: {
                    start: { line: l, character: c },
                    end: { line: l, character: c + 1 },
                },
                severity: sev,
                source: 'noolang',
                message,
            });
        }
    };
    stderr.split(/\r?\n/).forEach(processLine);
    if (result.status !== 0 && /Error/.test(stdout))
        stdout.split(/\r?\n/).forEach(processLine);
    if (diags.length === 0 && (stderr.trim() || stdout.trim())) {
        diags.push({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: node_1.DiagnosticSeverity.Error,
            source: 'noolang',
            message: `Error: ${stderr.trim() || stdout.trim()}`,
        });
    }
    return diags;
}
function getTypeInfo(filePath) {
    const res = runNodeCli(['--types-file', filePath]);
    if (res.status === 0)
        return parseTypesOutput(res.stdout || '');
    return [];
}
function getExpressionTypes(expr) {
    const res = runNodeCli(['--types', expr]);
    if (res.status === 0)
        return parseTypesOutput(res.stdout || '');
    return [];
}
function getAstFile(filePath) {
    const res = runNodeCli(['--ast-file', filePath]);
    if (res.status !== 0)
        return undefined;
    const lines = (res.stdout || '').split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim().startsWith('{'));
    if (start >= 0) {
        try {
            return JSON.parse(lines.slice(start).join('\n'));
        }
        catch { }
    }
    return undefined;
}
function simplifyTypeString(typeStr) {
    if (typeStr.startsWith('{ ') && typeStr.includes(': ') && typeStr.length > 50)
        return 'Record';
    if (typeStr.includes(' -> '))
        return typeStr.replace(/ -> /g, ' → ');
    return typeStr;
}
function extractIdentifierAtPosition(line, column) {
    const chars = [...line];
    if (column >= chars.length)
        return undefined;
    let start = column;
    let end = column;
    while (start > 0 && /[A-Za-z0-9_]/.test(chars[start - 1]))
        start--;
    while (end < chars.length && /[A-Za-z0-9_]/.test(chars[end]))
        end++;
    if (start < end) {
        const id = chars.slice(start, end).join('');
        if (/^[A-Za-z]/.test(id))
            return id;
    }
    return undefined;
}
function extractExpressionAtPosition(line, column) {
    const chars = [...line];
    if (column >= chars.length)
        return undefined;
    let start = column;
    let end = column;
    while (start > 0 && /[A-Za-z0-9_]/.test(chars[start - 1]))
        start--;
    while (end < chars.length && /[A-Za-z0-9_]/.test(chars[end]))
        end++;
    return start < end ? chars.slice(start, end).join('') : undefined;
}
function positionWithinRange(targetLine, targetCol, startLine, startCol, endLine, endCol) {
    if (targetLine < startLine || targetLine > endLine)
        return false;
    if (targetLine === startLine && targetCol < startCol)
        return false;
    if (targetLine === endLine && targetCol > endCol)
        return false;
    return true;
}
function extractSymbolAtPosition(ast, line, column) {
    function walk(node) {
        if (!node || typeof node !== 'object')
            return undefined;
        const loc = node.location;
        if (loc && loc.start && loc.end) {
            const sL = Number(loc.start.line);
            const sC = Number(loc.start.column);
            const eL = Number(loc.end.line);
            const eC = Number(loc.end.column);
            if (positionWithinRange(line, column, sL, sC, eL, eC)) {
                const kind = node.kind;
                if (kind === 'variable' || kind === 'definition') {
                    const name = node.name;
                    if (typeof name === 'string')
                        return name;
                }
            }
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                const r = walk(item);
                if (r)
                    return r;
            }
        }
        else {
            for (const key of Object.keys(node)) {
                const r = walk(node[key]);
                if (r)
                    return r;
            }
        }
        return undefined;
    }
    return walk(ast);
}
function findDefinition(ast, symbolName) {
    function walk(node) {
        if (!node || typeof node !== 'object')
            return undefined;
        if (node.kind === 'definition' && typeof node.name === 'string' && node.name === symbolName) {
            const loc = node.location;
            if (loc?.start && loc?.end) {
                const valueKind = node.value?.kind;
                const kind = valueKind === 'function' ? node_1.SymbolKind.Function : node_1.SymbolKind.Variable;
                return {
                    name: node.name,
                    kind,
                    range: node_1.Range.create(node_1.Position.create(Number(loc.start.line) - 1, Number(loc.start.column) - 1), node_1.Position.create(Number(loc.end.line) - 1, Number(loc.end.column) - 1)),
                };
            }
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                const r = walk(item);
                if (r)
                    return r;
            }
        }
        else {
            for (const key of Object.keys(node)) {
                const r = walk(node[key]);
                if (r)
                    return r;
            }
        }
        return undefined;
    }
    return walk(ast);
}
function findReferences(ast, symbolName, uri) {
    const refs = [];
    function walk(node) {
        if (!node || typeof node !== 'object')
            return;
        if (node.kind === 'variable' && typeof node.name === 'string' && node.name === symbolName) {
            const loc = node.location;
            if (loc?.start && loc?.end) {
                refs.push(node_1.Location.create(uri, node_1.Range.create(node_1.Position.create(Number(loc.start.line) - 1, Number(loc.start.column) - 1), node_1.Position.create(Number(loc.end.line) - 1, Number(loc.end.column) - 1))));
            }
        }
        if (Array.isArray(node))
            node.forEach(walk);
        else
            Object.values(node).forEach(walk);
    }
    walk(ast);
    return refs;
}
function extractAllSymbols(ast, uri) {
    const symbols = [];
    function walk(node) {
        if (!node || typeof node !== 'object')
            return;
        if (node.kind === 'definition' && typeof node.name === 'string') {
            const loc = node.location;
            if (loc?.start && loc?.end) {
                const valueKind = node.value?.kind;
                const kind = valueKind === 'function' ? node_1.SymbolKind.Function : node_1.SymbolKind.Variable;
                symbols.push({
                    name: node.name,
                    kind,
                    location: node_1.Location.create(uri, node_1.Range.create(node_1.Position.create(Number(loc.start.line) - 1, Number(loc.start.column) - 1), node_1.Position.create(Number(loc.end.line) - 1, Number(loc.end.column) - 1))),
                });
            }
        }
        if (Array.isArray(node))
            node.forEach(walk);
        else
            Object.values(node).forEach(walk);
    }
    walk(ast);
    return symbols;
}
function getPositionType(filePath, line1, col1) {
    const ast = getAstFile(filePath);
    if (ast) {
        const name = extractSymbolAtPosition(ast, line1, col1);
        if (name) {
            // Try symbol type via CLI --symbol-type
            const res = runNodeCli(['--symbol-type', filePath, name]);
            if (res.status === 0) {
                const out = res.stdout || '';
                const i = out.indexOf('has type: ');
                if (i >= 0)
                    return simplifyTypeString(out.slice(i + 10).trim());
            }
        }
    }
    const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const lines = text.split(/\r?\n/);
    const line = lines[line1 - 1] ?? '';
    const expr = extractExpressionAtPosition(line, col1 - 1);
    if (expr) {
        const types = getExpressionTypes(expr);
        if (types[0])
            return simplifyTypeString(types[0]);
    }
    const id = extractIdentifierAtPosition(line, col1 - 1);
    if (id) {
        const res = runNodeCli(['--symbol-type', filePath, id]);
        if (res.status === 0) {
            const i = (res.stdout || '').indexOf('has type: ');
            if (i >= 0)
                return simplifyTypeString((res.stdout || '').slice(i + 10).trim());
        }
    }
    return undefined;
}
// --- LSP Handlers ---
connection.onInitialize((_params) => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', '|', '@'],
            },
            hoverProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
        },
        serverInfo: { name: 'Noolang Language Server', version: '0.1.0' },
    };
});
connection.onInitialized(() => {
    connection.console.info('Noolang LSP server initialized (TypeScript)');
});
connection.onShutdown(() => {
    // no-op
});
connection.onDidOpenTextDocument((params) => {
    const uri = params.textDocument.uri;
    const content = params.textDocument.text;
    documents.set(uri, content);
    const filePath = uriToFilePath(uri);
    if (filePath) {
        const diagnostics = getDiagnostics(filePath);
        connection.sendDiagnostics({ uri, diagnostics });
    }
});
connection.onDidChangeTextDocument((params) => {
    const uri = params.textDocument.uri;
    for (const change of params.contentChanges) {
        // FULL sync: last change contains full text
        if (typeof change.text === 'string') {
            documents.set(uri, change.text);
        }
    }
    const filePath = uriToFilePath(uri);
    if (filePath) {
        const diagnostics = getDiagnostics(filePath);
        connection.sendDiagnostics({ uri, diagnostics });
    }
});
connection.onDidSaveTextDocument((params) => {
    const uri = params.textDocument.uri;
    const filePath = uriToFilePath(uri);
    if (filePath) {
        const diagnostics = getDiagnostics(filePath);
        connection.sendDiagnostics({ uri, diagnostics });
    }
});
connection.onCompletion((params) => {
    const items = [];
    const keywords = ['fn', 'if', 'then', 'else', 'match', 'with', 'variant', 'mut', 'constraint', 'implement'];
    const ctors = ['True', 'False', 'Some', 'None', 'Ok', 'Err'];
    const builtins = ['head', 'tail', 'map', 'filter', 'reduce', 'length', 'print', 'toString', 'read', 'write', 'log', 'random'];
    const mk = (label, kind) => ({
        label,
        kind,
        detail: `Noolang ${kind === node_1.CompletionItemKind.Constructor ? 'constructor' : keywords.includes(label) ? 'keyword' : 'function'}`,
        insertText: label,
    });
    items.push(...keywords.map((k) => mk(k, node_1.CompletionItemKind.Keyword)));
    items.push(...ctors.map((c) => mk(c, node_1.CompletionItemKind.Constructor)));
    items.push(...builtins.map((b) => mk(b, node_1.CompletionItemKind.Function)));
    return items;
});
connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const filePath = uriToFilePath(uri);
    if (!filePath)
        return null;
    const pos = params.position;
    const type = getPositionType(filePath, pos.line + 1, pos.character + 1);
    if (type) {
        return {
            contents: { kind: node_1.MarkupKind.Markdown, value: 'Type: ' + type },
            range: node_1.Range.create(pos, node_1.Position.create(pos.line, pos.character + 1)),
        };
    }
    const types = getTypeInfo(filePath);
    if (types[0]) {
        return {
            contents: { kind: node_1.MarkupKind.Markdown, value: 'Type: ' + simplifyTypeString(types[0]) },
            range: node_1.Range.create(pos, node_1.Position.create(pos.line, pos.character + 1)),
        };
    }
    return null;
});
connection.onDefinition((params) => {
    const uri = params.textDocument.uri;
    const filePath = uriToFilePath(uri);
    if (!filePath)
        return null;
    const pos = params.position;
    const ast = getAstFile(filePath);
    if (!ast)
        return null;
    const name = extractSymbolAtPosition(ast, pos.line + 1, pos.character + 1);
    if (!name)
        return null;
    const def = findDefinition(ast, name);
    if (!def)
        return null;
    return node_1.Location.create(uri, def.range);
});
connection.onReferences((params) => {
    const uri = params.textDocument.uri;
    const filePath = uriToFilePath(uri);
    if (!filePath)
        return [];
    const pos = params.position;
    const ast = getAstFile(filePath);
    if (!ast)
        return [];
    const name = extractSymbolAtPosition(ast, pos.line + 1, pos.character + 1);
    if (!name)
        return [];
    // References in this file
    const refs = findReferences(ast, name, uri);
    return refs;
});
connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const filePath = uriToFilePath(uri);
    if (!filePath)
        return [];
    const ast = getAstFile(filePath);
    if (!ast)
        return [];
    return extractAllSymbols(ast, uri);
});
connection.listen();
//# sourceMappingURL=server.js.map