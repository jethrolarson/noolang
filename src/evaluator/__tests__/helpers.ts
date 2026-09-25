import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import {
	createTraitRegistry,
	type TraitRegistry,
} from '../../typer/trait-system';
import { parseAndType } from '../../../test/utils';
import { Evaluator } from '../evaluator';

export const parseProgram = (source: string) =>
	parse(new Lexer(source).tokenize());

export const createBareEvaluator = (
	traitRegistry: TraitRegistry = createTraitRegistry()
) =>
	new Evaluator({
		traitRegistry,
		skipStdlib: true,
	});

export const createTypedEvaluator = (source: string) => {
	const typed = parseAndType(source);
	return {
		...typed,
		evaluator: new Evaluator({ traitRegistry: typed.state.traitRegistry }),
	};
};
