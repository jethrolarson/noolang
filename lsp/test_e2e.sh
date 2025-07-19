#!/bin/bash

# Build the LSP
cargo build

# Test initialization
echo "Testing LSP initialization..."
echo 'Content-Length: 116

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":123,"rootUri":"file:///tmp","capabilities":{}}}' | cargo run

echo ""
echo "LSP test completed!" 