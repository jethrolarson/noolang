const { Lexer } = require("./dist/lexer");
const { parse } = require("./dist/parser/parser");
const { typeProgram, typeToString } = require("./dist/typer_functional");

// Helper function to parse a string into a program
const parseProgram = (source) => {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return parse(tokens);
};

console.log("=== Debugging Constraint Propagation ===");

// Test the failing case step by step
const testCases = [
  "head [1, 2, 3]",
  "id = fn x => x; head (id [1, 2, 3])",
  `compose = fn f g => fn x => f (g x);
   safeHead = compose head;
   id = fn x => x;
   result = safeHead id [1, 2, 3]`,
];

for (let i = 0; i < testCases.length; i++) {
  console.log(`\n--- Test Case ${i + 1} ---`);
  console.log("Code:");
  console.log(testCases[i]);
  console.log("\nResult:");

  try {
    const program = parseProgram(testCases[i]);
    const result = typeProgram(program);
    console.log("Type:", typeToString(result.type, result.state.substitution));

    // Debug: Show substitution map
    console.log("\nSubstitution map:");
    for (const [varName, type] of result.state.substitution.entries()) {
      console.log(`  ${varName} -> ${typeToString(type)}`);
    }

    // Debug: Show constraints
    console.log("\nConstraints:");
    for (const constraint of result.state.constraints) {
      console.log(`  ${JSON.stringify(constraint)}`);
    }

    console.log("✅ SUCCESS (should have failed for case 3)");
  } catch (error) {
    console.log("❌ ERROR:", error.message);
  }
}

console.log("\n=== End Debug ===");
