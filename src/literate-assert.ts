import type { ExecutionStep } from './evaluator/evaluator';
import { formatValue, formatValueWithType } from './format';
import { typeToString } from './typer/helpers';

const ARROW_RE = /#\s*=>\s*(.+?)\s*$/;
const NO_SUBSTITUTION = new Map();

// Finds where the real trailing comment starts on a source line, skipping
// over `#` characters inside string/template literals — a naive raw-text
// scan mistakes a `#` inside a checked string value (e.g. `"a # => b"`) for
// the comment start, misparsing the rest of the line as the expected value.
function findCommentStart(line: string): number {
	let inString: '"' | '`' | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inString) {
			if (ch === '\\') {
				i++; // skip the escaped character
				continue;
			}
			if (ch === inString) inString = null;
			continue;
		}
		if (ch === '"' || ch === '`') {
			inString = ch;
			continue;
		}
		if (ch === '#') return i;
	}
	return -1;
}

// Literate `.md` files' `assert: true` frontmatter makes trailing `# =>`
// comments load-bearing: each leaf's real evaluated value is always checked;
// its type is checked too, but only if the annotation wrote one — a
// value-only annotation (`# => 3`) matches on value alone, never on the
// coincidence of `step.type` being absent, since the typer's leaf decoration
// means it practically never is. `trace` must come from
// `Evaluator.evaluateProgramForAssertions` (one step per un-parenthesized
// `;`-leaf, each already carrying its own resolved `.type` from the typer's
// leaf decoration), not the coarser `evaluateProgram` trace. Each leaf's
// `.type` is already fully substituted by the typer before evaluation runs,
// so no substitution map is needed here.
export function checkLiterateAssertions(source: string, trace: ExecutionStep[]): void {
	const lines = source.split('\n');
	for (const step of trace) {
		const line = step.location?.line;
		if (line == null) continue;
		const srcLine = lines[line - 1];
		if (srcLine === undefined) continue;
		const commentStart = findCommentStart(srcLine);
		if (commentStart === -1) continue;
		const match = srcLine.slice(commentStart).match(ARROW_RE);
		if (!match) continue;
		const expected = match[1].trim();
		const valueOnly = formatValue(step.result);
		const withType = formatValueWithType(
			step.result,
			step.type,
			typeToString,
			NO_SUBSTITUTION
		);
		if (expected !== valueOnly && expected !== withType) {
			throw new Error(
				`Assertion failed at line ${line}: expected \`${expected}\`, got \`${withType}\``
			);
		}
	}
}
