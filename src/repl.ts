import * as readline from "readline";
import { Lexer } from "./lexer";
import { parse } from "./parser/parser";
import { Evaluator, Value, isNativeFunction } from "./evaluator";
import {
  typeAndDecorate,
  typeToString,
  TypeState,
  createTypeState,
  initializeBuiltins,
} from "./typer_functional";
import { Type } from "./ast";
import { formatValue } from "./format";
import { colorize, supportsColors } from "./colors";

export class REPL {
  private evaluator: Evaluator;
  private rl: readline.Interface;
  private typeState: TypeState;

  constructor() {
    this.evaluator = new Evaluator();
    this.typeState = createTypeState();
    this.typeState = initializeBuiltins(this.typeState);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "noolang> ",
    });
  }

  start(): void {
    console.log(colorize.success("Welcome to Noolang!"));
    console.log("Type expressions or definitions. Use Ctrl+C to exit.");
    console.log("");

    this.rl.prompt();

    this.rl.on("line", (input: string) => {
      try {
        this.processInput(input.trim());
      } catch (error) {
        console.error(colorize.error(`Error: ${(error as Error).message}`));
      }
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log(colorize.info("\nGoodbye!"));
      process.exit(0);
    });
  }

  private processInput(input: string): void {
    if (input === "") {
      return;
    }

    // Handle REPL commands
    if (input.startsWith(".")) {
      this.handleCommand(input);
      return;
    }

    try {
      // Parse the input
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      // Type check the program using functional typer with persistent state
      const { program: decoratedProgram, state } = typeAndDecorate(
        program,
        this.typeState,
      );

      // Update the persistent type state for next REPL input
      this.typeState = state;
      const finalType =
        decoratedProgram.statements[decoratedProgram.statements.length - 1]
          ?.type;

      // Evaluate the decorated program (with type information)
      const programResult = this.evaluator.evaluateProgram(decoratedProgram);

      // Note: The evaluator's environment should already be updated by evaluateProgram
      // No need to manually copy the environment back

      // Print final result prominently
      console.log(
        `${colorize.section("➡")} ${colorize.value(
          formatValue(programResult.finalResult),
        )} \t ${colorize.section(":")} ${
          finalType
            ? colorize.type(typeToString(finalType, state.substitution))
            : "unknown"
        }`,
      );

      // Show execution trace for debugging (LLM-friendly)
      if (programResult.executionTrace.length > 1) {
        console.log(`\n${colorize.section("Execution Trace:")}`);
        programResult.executionTrace.forEach((step, i) => {
          console.log(
            `  ${colorize.number(`${i + 1}.`)} ${colorize.identifier(
              step.expression,
            )} ${colorize.operator("→")} ${colorize.value(
              formatValue(step.result),
            )}`,
          );
        });
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      // Check if it's already a formatted type error
      if (
        errorMessage.includes("TypeError:") &&
        errorMessage.includes("Expected:")
      ) {
        console.error(colorize.error(errorMessage));
      } else {
        console.error(colorize.error(`Error: ${errorMessage}`));
      }
    }
  }

  private valueToString(value: Value): string {
    if (typeof value === "function") {
      return "<function>";
    } else if (isNativeFunction(value)) {
      return `<native:${value.name}>`;
    } else if (Array.isArray(value)) {
      return `[${value.map(this.valueToString).join(", ")}]`;
    } else {
      return String(value);
    }
  }

  private typeToString(type: Type): string {
    switch (type.kind) {
      case "primitive":
        return type.name;
      case "function":
        return `${this.typeToString(type.params[0])} -> ${this.typeToString(
          type.return,
        )}`;
      case "variable":
        return type.name;
      case "unknown":
        return "?";
      default:
        return "unknown";
    }
  }

  private showHelp(): void {
    console.log(colorize.section("Noolang REPL Commands:"));
    console.log("");
    console.log(colorize.section("Basic Commands:"));
    console.log(`  ${colorize.command(".help")}     - Show this help message`);
    console.log(`  ${colorize.command(".quit")}     - Exit the REPL`);
    console.log(`  ${colorize.command(".exit")}     - Exit the REPL`);
    console.log("");
    console.log(colorize.section("Environment Commands:"));
    console.log(
      `  ${colorize.command(".env")}      - Show current environment`,
    );
    console.log(
      `  ${colorize.command(
        ".env-detail",
      )} - Show detailed environment with types`,
    );
    console.log(
      `  ${colorize.command(".env-json")} - Show environment as JSON`,
    );
    console.log(`  ${colorize.command(".clear-env")} - Clear environment`);
    console.log(`  ${colorize.command(".types")}    - Show type environment`);
    console.log("");
    console.log(colorize.section("Debugging Commands:"));
    console.log(
      `  ${colorize.command(".tokens (expr)")}     - Show tokens for expression`,
    );
    console.log(
      `  ${colorize.command(".tokens-file file")}  - Show tokens for file`,
    );
    console.log(
      `  ${colorize.command(".ast (expr)")}        - Show AST for expression`,
    );
    console.log(
      `  ${colorize.command(".ast-file file")}     - Show AST for expression`,
    );
    console.log(
      `  ${colorize.command(".ast-json (expr)")}   - Show AST as JSON`,
    );
    console.log(
      `  ${colorize.command(".error-detail")}      - Show detailed error info`,
    );
    console.log(
      `  ${colorize.command(".error-context")}     - Show error context`,
    );
    console.log("");
    console.log(colorize.section("Examples:"));
    console.log(`  ${colorize.identifier("add = fn x y => x + y")}`);
    console.log(`  ${colorize.identifier("add 2 3")}`);
    console.log(`  ${colorize.identifier("[1; 2; 3] |> head")}`);
    console.log(`  ${colorize.identifier("if true then 1 else 2")}`);
    console.log("");
    console.log(colorize.section("Debugging Examples:"));
    console.log(`  ${colorize.command(".tokens (result1 = (@add math) 2 3)")}`);
    console.log(`  ${colorize.command(".ast (a = 1; b = 2)")}`);
    console.log(`  ${colorize.command(".ast-file test_import_record.noo")}`);
  }

  private showEnvironment(): void {
    const env = this.evaluator.getEnvironment();
    console.log(colorize.section("Current Environment:"));
    for (const [name, value] of env) {
      console.log(
        `  ${colorize.identifier(name)}: ${colorize.value(formatValue(value))}`,
      );
    }
  }

  private handleCommand(input: string): void {
    const [command, ...args] = input.split(" ");

    switch (command) {
      case ".quit":
      case ".exit":
        this.rl.close();
        break;

      case ".help":
        this.showHelp();
        break;

      case ".env":
        this.showEnvironment();
        break;

      case ".env-detail":
        this.showDetailedEnvironment();
        break;

      case ".env-json":
        this.showEnvironmentAsJSON();
        break;

      case ".clear-env":
        this.clearEnvironment();
        break;

      case ".types":
        this.showTypeEnvironment();
        break;

      case ".tokens":
        this.showTokensFromParens(args.join(" "));
        break;

      case ".tokens-file":
        this.showTokensFromFile(args[0]);
        break;

      case ".ast":
        this.showASTFromParens(args.join(" "));
        break;

      case ".ast-file":
        this.showASTFromFile(args[0]);
        break;

      case ".ast-json":
        this.showASTAsJSONFromParens(args.join(" "));
        break;

      case ".error-detail":
        this.showErrorDetail();
        break;

      case ".error-context":
        this.showErrorContext();
        break;

      default:
        console.log(`Unknown command: ${command}`);
        console.log("Use .help to see available commands");
    }
  }

  private showDetailedEnvironment(): void {
    const env = this.evaluator.getEnvironment();

    console.log(colorize.section("Detailed Environment:"));
    for (const [name, value] of env) {
      console.log(`  ${colorize.identifier(name)}:`);
      console.log(
        `    ${colorize.section("Value:")} ${colorize.value(
          this.valueToString(value),
        )}`,
      );
      console.log(
        `    ${colorize.section("Type:")} ${colorize.type("unknown")}`,
      );
    }
  }

  private showEnvironmentAsJSON(): void {
    const env = this.evaluator.getEnvironment();

    const envObj: any = {};
    for (const [name, value] of env) {
      envObj[name] = {
        value: this.valueToString(value),
        type: "unknown",
      };
    }

    console.log(JSON.stringify(envObj, null, 2));
  }

  private clearEnvironment(): void {
    this.evaluator = new Evaluator();
    console.log(colorize.success("Environment cleared"));
  }

  private showTokensFromParens(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .tokens (expression)"));
      return;
    }

    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log(
        colorize.warning(
          "Usage: .tokens (expression) - expression must be wrapped in parentheses",
        ),
      );
      return;
    }

    const expression = match[1].trim();

    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();

      console.log(
        `${colorize.section("Tokens for")} "${colorize.identifier(
          expression,
        )}":`,
      );
      tokens.forEach((token, i) => {
        console.log(
          `  ${colorize.number(`${i}:`)} ${colorize.type(
            token.type,
          )} ${colorize.string(`'${token.value}'`)}`,
        );
      });
    } catch (error) {
      console.error(
        colorize.error(`Error tokenizing: ${(error as Error).message}`),
      );
    }
  }

  private showTokens(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .tokens (expression)"));
      return;
    }

    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();

      console.log(
        `${colorize.section("Tokens for")} "${colorize.identifier(input)}":`,
      );
      tokens.forEach((token, i) => {
        console.log(
          `  ${colorize.number(`${i}:`)} ${colorize.type(
            token.type,
          )} ${colorize.string(`'${token.value}'`)}`,
        );
      });
    } catch (error) {
      console.error(
        colorize.error(`Error tokenizing: ${(error as Error).message}`),
      );
    }
  }

  private showTokensFromFile(filename: string): void {
    if (!filename) {
      console.log(colorize.warning("Usage: .tokens-file filename.noo"));
      return;
    }

    try {
      const fs = require("fs");
      const path = require("path");
      const fullPath = path.resolve(filename);
      const code = fs.readFileSync(fullPath, "utf8");

      console.log(
        `${colorize.section("Tokens for file")} "${colorize.identifier(
          filename,
        )}":`,
      );
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();

      tokens.forEach((token, i) => {
        console.log(
          `  ${colorize.number(`${i}:`)} ${colorize.type(
            token.type,
          )} ${colorize.string(`'${token.value}'`)}`,
        );
      });
    } catch (error) {
      console.error(
        colorize.error(`Error reading file: ${(error as Error).message}`),
      );
    }
  }

  private showASTFromParens(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .ast (expression)"));
      return;
    }

    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log(
        colorize.warning(
          "Usage: .ast (expression) - expression must be wrapped in parentheses",
        ),
      );
      return;
    }

    const expression = match[1].trim();

    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      console.log(
        `${colorize.section("AST for")} "${colorize.identifier(expression)}":`,
      );
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(
        colorize.error(`Error parsing: ${(error as Error).message}`),
      );
    }
  }

  private showAST(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .ast (expression)"));
      return;
    }

    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      console.log(
        `${colorize.section("AST for")} "${colorize.identifier(input)}":`,
      );
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(
        colorize.error(`Error parsing: ${(error as Error).message}`),
      );
    }
  }

  private showASTFromFile(filename: string): void {
    if (!filename) {
      console.log(colorize.warning("Usage: .ast-file filename.noo"));
      return;
    }

    try {
      const fs = require("fs");
      const path = require("path");
      const fullPath = path.resolve(filename);
      const code = fs.readFileSync(fullPath, "utf8");

      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      console.log(
        `${colorize.section("AST for file")} "${colorize.identifier(
          filename,
        )}":`,
      );
      console.log(this.astToString(program.statements[0]));
    } catch (error) {
      console.error(
        colorize.error(`Error parsing file: ${(error as Error).message}`),
      );
    }
  }

  private showASTAsJSONFromParens(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .ast-json (expression)"));
      return;
    }

    // Extract content from parentheses
    const match = input.match(/^\((.*)\)$/);
    if (!match) {
      console.log(
        colorize.warning(
          "Usage: .ast-json (expression) - expression must be wrapped in parentheses",
        ),
      );
      return;
    }

    const expression = match[1].trim();

    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      console.log(JSON.stringify(program.statements[0], null, 2));
    } catch (error) {
      console.error(
        colorize.error(`Error parsing: ${(error as Error).message}`),
      );
    }
  }

  private showASTAsJSON(input: string): void {
    if (!input) {
      console.log(colorize.warning("Usage: .ast-json (expression)"));
      return;
    }

    try {
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      const program = parse(tokens);

      console.log(JSON.stringify(program.statements[0], null, 2));
    } catch (error) {
      console.error(
        colorize.error(`Error parsing: ${(error as Error).message}`),
      );
    }
  }

  private showErrorDetail(): void {
    console.log(
      colorize.warning("Error detail not available - no recent error"),
    );
  }

  private showErrorContext(): void {
    console.log(
      colorize.warning("Error context not available - no recent error"),
    );
  }

  private astToString(expr: any, indent: number = 0): string {
    const spaces = "  ".repeat(indent);

    switch (expr.kind) {
      case "literal":
        return `${spaces}${colorize.type("Literal")}: ${colorize.value(
          expr.value,
        )}`;
      case "variable":
        return `${spaces}${colorize.type("Variable")}: ${colorize.identifier(
          expr.name,
        )}`;
      case "function":
        return `${spaces}${colorize.type(
          "Function",
        )}:\n${spaces}  ${colorize.section("params")}: [${expr.params
          .map((p: string) => colorize.identifier(p))
          .join(", ")}]\n${spaces}  ${colorize.section(
          "body",
        )}: ${this.astToString(expr.body, indent + 1)}`;
      case "application":
        return `${spaces}${colorize.type(
          "Application",
        )}:\n${spaces}  ${colorize.section("func")}: ${this.astToString(
          expr.func,
          indent + 1,
        )}\n${spaces}  ${colorize.section("args")}: [${expr.args
          .map((arg: any) => this.astToString(arg, indent + 1))
          .join(", ")}]`;
      case "binary":
        return `${spaces}${colorize.type("Binary")}(${colorize.operator(
          expr.operator,
        )}):\n${spaces}  ${colorize.section("left")}: ${this.astToString(
          expr.left,
          indent + 1,
        )}\n${spaces}  ${colorize.section("right")}: ${this.astToString(
          expr.right,
          indent + 1,
        )}`;
      case "definition":
        return `${spaces}${colorize.type(
          "Definition",
        )}:\n${spaces}  ${colorize.section("name")}: ${colorize.identifier(
          expr.name,
        )}\n${spaces}  ${colorize.section("value")}: ${this.astToString(
          expr.value,
          indent + 1,
        )}`;
      case "import":
        return `${spaces}${colorize.type("Import")}: ${colorize.string(
          `"${expr.path}"`,
        )}`;
      case "record":
        return `${spaces}${colorize.type("Record")}:\n${expr.fields
          .map(
            (field: any) =>
              `${spaces}  ${colorize.identifier(
                field.name,
              )}: ${this.astToString(field.value, indent + 1)}`,
          )
          .join("\n")}`;
      case "accessor":
        return `${spaces}${colorize.type("Accessor")}: ${colorize.operator(
          "@",
        )}${colorize.identifier(expr.field)}`;
      default:
        return `${spaces}${colorize.type(expr.kind)}: ${colorize.value(
          JSON.stringify(expr),
        )}`;
    }
  }

  private showTypeEnvironment(): void {
    console.log(colorize.section("Type Environment:"));
    console.log(
      colorize.warning("Type environment not available in functional typer"),
    );
  }
}

// Start the REPL if this file is run directly
if (typeof require !== "undefined" && require.main === module) {
  const repl = new REPL();
  repl.start();
}
