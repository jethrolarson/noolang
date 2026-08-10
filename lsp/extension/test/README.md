# LSP Test Harness

A lightweight test harness for the Noolang LSP server that allows testing LSP protocol messages without running a full VSCode instance.

## Structure

```
test/
├── harness/
│   ├── InMemoryTransport.ts    # In-memory MessageReader/MessageWriter
│   ├── LSPServerHarness.ts     # Test harness main class
│   └── TestServer.ts           # LSP server logic (mirrors server.ts)
├── fixtures/
│   └── simple.noo              # Sample .noo file for testing
└── completion.test.ts          # Completion feature tests
```

## Usage

```typescript
import { LSPServerHarness } from './harness/LSPServerHarness';

describe('LSP Feature Tests', () => {
  let harness: LSPServerHarness;

  beforeAll(async () => {
    harness = await LSPServerHarness.create();
  });

  afterAll(async () => {
    await harness.close();
  });

  test('completion request', async () => {
    const uri = 'file:///test.noo';
    await harness.openDocument(uri, 'noolang', 'fn x => x');

    const completions = await harness.requestCompletion(uri, 0, 2);
    expect(completions.length).toBeGreaterThan(0);
  });
});
```

## How It Works

1. **In-Memory Transport**: `InMemoryTransport.ts` implements `MessageReader` and `MessageWriter` interfaces from `vscode-jsonrpc` using in-memory queues instead of network/stdio.

2. **Bidirectional Communication**: Creates paired reader/writer objects that share queues:
   - `clientWriter` → `serverReader` (client sends requests to server)
   - `serverWriter` → `clientReader` (server sends responses to client)

3. **Dual Connections**: The harness creates two LSP connections:
   - Server connection: Registers LSP handlers (completion, hover, etc.)
   - Client connection: Sends requests and receives responses

4. **Test Server**: `TestServer.ts` contains the same LSP handler logic as the main `server.ts`, but accepts a custom connection for testing.

## Running Tests

```bash
cd lsp/extension
bun test              # Run all tests (the npm scripts are Bun wrappers)
bun test --watch      # Run tests in watch mode
```

## Extending to Other Features

The harness provides helper methods that can be extended:

- `requestHover(uri, line, character)` - Already available
- `requestCompletion(uri, line, character)` - Already available
- `openDocument(uri, languageId, content)` - Already available
- `changeDocument(uri, content, version)` - Already available

To test a new feature (e.g., diagnostics):

1. Add a helper method to `LSPServerHarness.ts`:
```typescript
async requestDiagnostics(uri: string): Promise<Diagnostic[]> {
  return this.clientConnection.sendRequest('textDocument/diagnostic', { uri });
}
```

2. Create a test file (e.g., `diagnostics.test.ts`):
```typescript
test('reports type errors', async () => {
  const uri = 'file:///test.noo';
  await harness.openDocument(uri, 'noolang', '1 + "string"');

  const diagnostics = await harness.requestDiagnostics(uri);
  expect(diagnostics.some(d => d.severity === DiagnosticSeverity.Error)).toBe(true);
});
```

## Implementation Notes

- The harness uses a small delay (50ms) after starting listeners to ensure both sides are ready
- Each test should create its own document URIs to avoid conflicts
- The harness automatically handles initialization (initialize/initialized handshake)
- Cleanup is handled via the `close()` method which sends shutdown/exit notifications

## Future Improvements

- Add support for testing `publishDiagnostics` notifications
- Add support for workspace features (workspace/symbol, etc.)
- Add helper methods for document synchronization (didChange, didSave)
- Add fixtures for various code scenarios