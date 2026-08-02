import type { ExecutionStep } from './evaluator/evaluator';
import { formatValue, formatValueWithType } from './format';
import { typeToString } from './typer/helpers';

const ARROW_RE = /#\s*=>\s*(.+?)\s*$/;
const NO_SUBSTITUTION = new Map();

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
		const match = srcLine.match(ARROW_RE);
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
