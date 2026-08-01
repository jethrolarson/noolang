# Noolang Progress Tracker

## 🔄 FFI System Design (In Planning)

### **Design Philosophy**

Rather than implementing hundreds of built-in functions, Noolang will use a Foreign Function Interface (FFI) system that delegates to platform-specific adapters.

### **Syntax Design**

```noolang
# FFI calls use platform adapters
readFileSync = ffi "node" "fs.readFileSync"  # Node.js adapter interprets the path
malloc = ffi "c" "stdlib.malloc"              # C adapter interprets the path
fetch = ffi "browser" "window.fetch"          # Browser adapter interprets the path
```

### **Type System Integration**

- **Unknown Type**: FFI calls return `Unknown` type by default
- **Type Refinement**: Pattern matching to narrow `Unknown` to concrete types
- **forget Operation**: Convert any type to `Unknown` for dynamic behavior

```noolang
# FFI returns Unknown
readFile = ffi "node" "fs.readFileSync";

# Pattern matching to refine types
content = match (readFile "file.txt") (
  String s => s;
  Error e => "failed to read";
  _ => "unexpected type"
);

# forget operation for dynamic behavior
myBool = True;
dynamic = forget myBool;  # dynamic: Unknown
```

### **Dependency Chain Analysis**

The FFI system revealed a dependency chain that requires foundational features:

1. **FFI** → needs `Unknown` type for untyped foreign values
2. **Unknown** → needs type refinement through pattern matching
3. **Accessor chaining on Unknown** → needs optional accessors (`@field?`)
4. **Optional accessors** → need `|?` operator for Option chaining
5. **`|?` operator** → needs monadic bind for proper implementation
6. **Monadic bind** → needs trait/typeclass system for polymorphism

### **Current Decision**

**Pausing FFI implementation** to prioritize **trait/typeclass system** as the foundational feature that enables clean implementation of all dependent features.

## 🚀 Next Steps (Prioritized)

### **Language Polish (Medium Priority)**
4. **Standard Library Expansion**: Add missing common functions

### **Advanced Features (Lower Priority)**
1. **Unknown Type & Type Refinement**: Pattern matching on dynamically typed values with `forget` operation
3. **FFI System**: Foreign function interface with platform adapters (requires Unknown type)
4. **Optional Accessors**: `@field?` syntax for safe field access returning Options
6. **Module System**: Code organization across files

## 🎯 Language Design Principles
- **LLM Friendly**: Clear, predictable syntax patterns
- **Explicit Effects**: Effects tracked in type system
- **Strong Inference**: Types inferred where possible
- **Functional**: Immutable data, pure functions by default
- **Composable**: Pipeline operator and function composition
- **File Structure**: Each file is a single statement/expression
- **Data Consistency**: All structures use commas as separators

# Things the human is tracking
- Need to focus on cleanup and simplification of the codebase.
- Find all TODOs
- Type and parser errors should show the source code line and the line above and below
- What if we have a way for the llm to ask what the type at a particular point in the program is? maybe with a `^` character? Similar to how users can hover over code with the mouse. or maybe just supporting LSP will do that?
- Need module paths. Having to load everything via relative paths is troublesome
- we're using both camelCase and snake. 
- repl comments shouldn't be typed 
  ```
    noolang> # shouldn't output anything
    ➡ []     : unknown
  ```
- The way we're doing testing using assertions is really hard for me to understand. We should switch to declarative form like expect(type).toEqual(expect.objectContaining(foo))
- type of user type expressions should report the type of the type expression rather than unit