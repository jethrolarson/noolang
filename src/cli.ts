#!/usr/bin/env node
import { Lexer } from './lexer';
import { parse } from './parser/parser';
import { Evaluator } from './evaluator';
import { typeAndDecorate, typeToString } from "./typer_functional";
import * as fs from "fs";
import * as path from "path";
import { formatValue } from "./format";
import { colorize } from "./colors";

function printUsage() {
  console.log(colorize.section("Usage: noo <file.noo>"));
  console.log(`       ${colorize.command("noo --eval <expr>")}`);
  console.log(`       ${colorize.command("noo -e <expr>")}`);
  console.log(`       ${colorize.command("noo --tokens <expr>")}`);
  console.log(`       ${colorize.command("noo --ast <expr>")}`);
  console.log(`       ${colorize.command("noo --tokens-file <file>")}`);
  console.log(`       ${colorize.command("noo --ast-file <file>")}`);
  console.log(`       ${colorize.command("noo --types <expr>")}`);
  console.log(`       ${colorize.command("noo --types-file <file>")}`);
  console.log(`       ${colorize.command("noo --types-detailed <expr>")}`);
  console.log(`       ${colorize.command("noo --types-env <expr>")}`);
  console.log(`       ${colorize.command("noo --types-ast <expr>")}`);
  console.log("");
  console.log(colorize.section("Examples:"));
  console.log(`  ${colorize.identifier("noo my_program.noo")}`);
  console.log(`  ${colorize.identifier("noo examples/basic.noo")}`);
  console.log(`  ${colorize.identifier('noo --eval "1 + 2 * 3"')}`);
  console.log(`  ${colorize.identifier('noo -e "x = 10; x * 2"')}`);
  console.log(
    `  ${colorize.identifier('noo --tokens "{ @add fn x y => x + y }"')}`
  );
  console.log(
    `  ${colorize.identifier('noo --ast "if x > 0 then x else -x"')}`
  );
  console.log(`  ${colorize.identifier("noo --tokens-file std/math.noo")}`);
  console.log(`  ${colorize.identifier("noo --ast-file std/math.noo")}`);
  console.log(`  ${colorize.identifier('noo --types "fn x => x + 1"')}`);
  console.log(`  ${colorize.identifier("noo --types-file std/math.noo")}`);
  console.log(
    `  ${colorize.identifier('noo --types-detailed "fn x => x + 1"')}`
  );
  console.log(`  ${colorize.identifier('noo --types-env "fn x => x + 1"')}`);
  console.log(`  ${colorize.identifier('noo --types-ast "fn x => x + 1"')}`);
  console.log("");
  console.log(colorize.section("Or use the REPL:"));
  console.log(`  ${colorize.identifier("noo")}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // No file provided, start REPL
    console.log(colorize.success("Noolang REPL"));
    console.log('Type ":exit" or ":quit" to quit');
    console.log("");
    // Import and start REPL
    const { REPL } = await import("./repl");
    const repl = new REPL();
    repl.start();
    return;
  }

  // Check for --tokens flag
  if (args[0] === "--tokens" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      console.log(colorize.section("Tokens:"));
      tokens.forEach((token, i) => {
        console.log(
          `  ${colorize.number(`${i}:`)} ${colorize.type(
            token.type
          )} ${colorize.string(`('${token.value}')`)}`
        );
      });
    } catch (err) {
      console.error(colorize.error(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
    return;
  }

  // Check for --tokens-file flag
  if (args[0] === "--tokens-file" && args[1]) {
    const file = args[1];
    try {
      const fullPath = path.resolve(file);
      const code = fs.readFileSync(fullPath, "utf8");
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      console.log(colorize.section("Tokens:"));
      tokens.forEach((token, i) => {
        console.log(
          `  ${colorize.number(`${i}:`)} ${colorize.type(
            token.type
          )} ${colorize.string(`('${token.value}')`)}`
        );
      });
    } catch (err) {
      console.error(colorize.error(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
    return;
  }

  // Check for --ast flag
  if (args[0] === "--ast" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      console.log("AST:");
      console.log(JSON.stringify(program, null, 2));
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --ast-file flag
  if (args[0] === "--ast-file" && args[1]) {
    const file = args[1];
    try {
      const fullPath = path.resolve(file);
      const code = fs.readFileSync(fullPath, "utf8");
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      console.log("AST:");
      console.log(JSON.stringify(program, null, 2));
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --types flag
  if (args[0] === "--types" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      console.log("Types:");
      decoratedProgram.statements.forEach((stmt, i) => {
        console.log(
          `  ${i}: ${
            stmt.type
              ? typeToString(stmt.type, state.substitution)
              : "<no type>"
          }`
        );
      });
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --types-file flag
  if (args[0] === "--types-file" && args[1]) {
    const file = args[1];
    try {
      const fullPath = path.resolve(file);
      const code = fs.readFileSync(fullPath, "utf8");
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      console.log("Types:");
      decoratedProgram.statements.forEach((stmt, i) => {
        console.log(
          `  ${i}: ${
            stmt.type
              ? typeToString(stmt.type, state.substitution)
              : "<no type>"
          }`
        );
      });
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --types-detailed flag
  if (args[0] === "--types-detailed" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      console.log("Types (detailed):");
      decoratedProgram.statements.forEach((stmt, i) => {
        console.log(
          `  ${i}: ${
            stmt.type
              ? typeToString(stmt.type, state.substitution)
              : "<no type>"
          }`
        );
      });
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --types-env flag
  if (args[0] === "--types-env" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      console.log("Type Environment:");
      // The printTypeEnvironment function was removed from the new Typer,
      // so this part of the CLI will need to be updated or removed
      // if the user wants to keep this functionality.
      // For now, we'll just print the type environment.
      console.log(JSON.stringify(state.substitution, null, 2));
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --types-ast flag
  if (args[0] === "--types-ast" && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      console.log("Typed AST:");
      console.log(JSON.stringify(decoratedProgram, null, 2));
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Check for --eval or -e flag
  if ((args[0] === "--eval" || args[0] === "-e") && args[1]) {
    const expr = args[1];
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      const evaluator = new Evaluator();
      const finalResult = evaluator.evaluateProgram(decoratedProgram);
      const valueStr = formatValue(finalResult.finalResult);
      // Get the type from the last statement in the typed AST
      let typeStr = "";
      if (
        decoratedProgram &&
        Array.isArray(decoratedProgram.statements) &&
        decoratedProgram.statements.length > 0
      ) {
        const lastType =
          decoratedProgram.statements[decoratedProgram.statements.length - 1]
            .type;
        if (lastType) typeStr = typeToString(lastType, state.substitution);
      }
      // ANSI cyan for type
      const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
      console.log(valueStr);
      if (typeStr) {
        console.log(cyan("\t:\t") + cyan(typeStr));
      }
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // If not --eval, treat as file
  const file = args[0];
  if (!file) {
    printUsage();
    process.exit(1);
  }

  try {
    const fullPath = path.resolve(file);
    const code = fs.readFileSync(fullPath, "utf8");
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const { program: decoratedProgram, state } = typeAndDecorate(program);
    const evaluator = new Evaluator();
    const finalResult = evaluator.evaluateProgram(decoratedProgram);
    const valueStr = formatValue(finalResult.finalResult);
    // Get the type from the last statement in the typed AST
    let typeStr = "";
    if (
      decoratedProgram &&
      Array.isArray(decoratedProgram.statements) &&
      decoratedProgram.statements.length > 0
    ) {
      const lastType =
        decoratedProgram.statements[decoratedProgram.statements.length - 1]
          .type;
      if (lastType) typeStr = typeToString(lastType, state.substitution);
    }
    // ANSI cyan for type
    const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
    console.log(valueStr);
    if (typeStr) {
      console.log(cyan("Type: ") + cyan(typeStr));
    }
  } catch (err) {
    const errorMessage = (err as Error).message;
    // Check if it's already a formatted type error
    if (
      errorMessage.includes("TypeError:") &&
      errorMessage.includes("Expected:")
    ) {
      console.error(errorMessage);
    } else {
      console.error("Error:", errorMessage);
    }
    process.exit(1);
  }
}

main(); 