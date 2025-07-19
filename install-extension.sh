#!/bin/bash

set -e

echo "📦 Packaging VSCode extension..."

cd extension

# Install vsce if not available
if ! command -v vsce &> /dev/null; then
    echo "Installing vsce..."
    npm install -g @vscode/vsce
fi

# Package the extension
echo "Creating .vsix package..."
vsce package

echo ""
echo "✅ Extension packaged successfully!"
echo ""
echo "To install in VSCode:"
echo "1. Open VSCode"
echo "2. Go to Extensions panel (Ctrl+Shift+X)"
echo "3. Click '...' → 'Install from VSIX...'"
echo "4. Select: extension/noolang-lsp-0.1.0.vsix"
echo ""
echo "Or for development:"
echo "1. Open extension/ folder in VSCode"
echo "2. Press F5 to launch with extension loaded"
echo ""
echo "After installation, open test-lsp.noo to test the LSP!" 