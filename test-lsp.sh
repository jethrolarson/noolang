#!/bin/bash

set -e

echo "🔧 Building Noolang LSP..."
cd lsp
cargo build --release
cd ..

echo "📦 Installing extension dependencies..."
cd extension
npm install
npm run compile
cd ..

echo "🧪 Testing LSP server..."
cd lsp
cargo test
cd ..

echo "✅ LSP setup complete!"
echo ""
echo "To test in VSCode:"
echo "1. Open this workspace in VSCode"
echo "2. Open any .noo file"
echo "3. The LSP should activate automatically"
echo ""
echo "To debug the LSP:"
echo "1. Set breakpoints in lsp/src/server.rs"
echo "2. Press F5 to start debugging"
echo "3. Open a .noo file to trigger the LSP"
echo ""
echo "To run manual tests:"
echo "cd lsp && cargo run --bin noolang-lsp" 