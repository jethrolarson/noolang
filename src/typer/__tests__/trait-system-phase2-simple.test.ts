import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';

describe('Trait System Phase 2: Basic Infrastructure', () => {
	test('should parse and type constraint definition', () => {
		const code = `
			constraint Functor f {
				map: (a -> b) -> f a -> f b
			}
		`;

		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const typeResult = typeProgram(program);

		// Should not have errors
		expect(typeResult.errors).toEqual([]);
		
		// Should have the trait registered
		expect(typeResult.state.traitRegistry.definitions.has('Functor')).toBe(true);
		
		const functorTrait = typeResult.state.traitRegistry.definitions.get('Functor');
		expect(functorTrait?.name).toBe('Functor');
		expect(functorTrait?.functions.has('map')).toBe(true);
	});

	test('should parse and type implement definition', () => {
		const code = `
			constraint Functor f {
				map: (a -> b) -> f a -> f b
			}
			
			implement Functor Option {
				map f opt = case opt {
					Some x -> Some (f x)
					None -> None
				}
			}
		`;

		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const typeResult = typeProgram(program);

		// Should not have errors
		expect(typeResult.errors).toEqual([]);
		
		// Should have the trait registered
		expect(typeResult.state.traitRegistry.definitions.has('Functor')).toBe(true);
		
		// Should have implementation registered
		const functorImpls = typeResult.state.traitRegistry.implementations.get('Functor');
		expect(functorImpls?.has('Option')).toBe(true);
		
		const optionImpl = functorImpls?.get('Option');
		expect(optionImpl?.functions.has('map')).toBe(true);
	});

	test('should error on missing trait', () => {
		const code = `
			implement NonExistent Option {
				map f opt = Some (f opt)
			}
		`;

		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const typeResult = typeProgram(program);

		// Should have errors
		expect(typeResult.errors.length).toBeGreaterThan(0);
		expect(typeResult.errors[0].message).toContain('NonExistent');
	});
});