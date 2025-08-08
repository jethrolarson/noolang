#!/bin/bash

set -e

# Ensure vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "Installing vsce..."
    npm install -g @vscode/vsce
fi

# Build the extension and TS server
cd "$(dirname "$0")/extension"
echo "Building VSCode extension and TS LSP server..."
npm install
npm run compile

# Package the extension
vsce package

cd - >/dev/null

echo "Extension packaged. To install in VS Code, run:"
echo "  code --install-extension noolang-lsp-*.vsix"
echo "After installation, open a .noo file to test the LSP!" 