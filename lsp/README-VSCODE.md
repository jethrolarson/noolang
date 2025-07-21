# Noolang VSCode Extension

This extension provides syntax highlighting for the Noolang programming language in Visual Studio Code.

## Features

- **Syntax Highlighting**: Full support for Noolang syntax including:

  - Keywords (`fn`, `if`, `then`, `else`, `mut`, `import`, etc.)
  - Operators (`+`, `-`, `*`, `/`, `==`, `!=`, `|>`, `|`, `$`, etc.)
  - Data structures (lists `[1; 2; 3]`, records `{ @name "Alice" }`)
  - Accessors (`@field`)
  - Function definitions and applications
  - Comments (`#`)
  - Strings and numbers

- **Language Support**:
  - File association for `.noo` files
  - Auto-closing brackets and quotes
  - Indentation rules
  - Comment support
  - Code folding with `#region` and `#endregion`

## Installation

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run vscode:package` to create the extension package
4. In VSCode, go to Extensions (Ctrl+Shift+X)
5. Click the "..." menu and select "Install from VSIX..."
6. Select the generated `.vsix` file

### Development Installation

1. Clone this repository
2. Run `npm install`
3. Open the project in VSCode
4. Press F5 to launch a new Extension Development Host window
5. Open a `.noo` file to see the syntax highlighting in action

## Usage

Once installed, any file with the `.noo` extension will automatically have Noolang syntax highlighting applied.

### Example Noolang Code

```noolang
# This is a comment
add = fn x y => x + y

# Function application
result = add 2 3

# Data structures
numbers = [1; 2; 3; 4; 5]
person = { @name "Alice"; @age 30 }

# Pipeline operator
filtered = numbers |> filter (fn x => x > 2) |> map (fn x => x * 2)

# Conditional expressions
max_value = if result > 10 then result else 10
```

## Color Scheme

The extension uses standard VSCode color themes. Different elements will be highlighted according to your current theme:

- **Keywords**: `fn`, `if`, `then`, `else`, `mut`, `import`
- **Operators**: `+`, `-`, `*`, `/`, `==`, `!=`, `|>`, `|`, `$`
- **Strings**: `"hello world"`
- **Numbers**: `42`, `3.14`
- **Comments**: `# this is a comment`
- **Accessors**: `@field`
- **Data structures**: `[1; 2; 3]`, `{ @name "value" }`

## Contributing

To contribute to the syntax highlighting:

1. Edit `syntaxes/noolang.tmLanguage.json` to modify the grammar
2. Test your changes by running the extension in development mode
3. Submit a pull request

## License

MIT
