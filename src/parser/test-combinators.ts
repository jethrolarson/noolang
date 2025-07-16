import { Lexer } from "../lexer";
import { parse } from "./parser";

// Simple test function
export function testCombinatorParser() {
  console.log("Testing combinator parser...\n");

  const testCases = [
    "42",
    '"hello"',
    "x",
    "fn x => x + 1",
    "1 + 2 * 3",
    "[1, 2, 3]",
    "if True then 1 else 2",
    "x |> f |> g",
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase}`);
    try {
      const lexer = new Lexer(testCase);
      const tokens = lexer.tokenize();
      const ast = parse(tokens);
      console.log("✓ Success:", JSON.stringify(ast, null, 2));
    } catch (error) {
      console.log(
        "✗ Error:",
        error instanceof Error ? error.message : String(error),
      );
    }
    console.log("");
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testCombinatorParser();
}
