// Phase 3 Effects System Tests
// Testing effect validation, propagation, and built-in effectful functions

import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeProgram } from '../../../src/typer';
import type { Effect } from '../../../src/ast';

const runNoolang = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	return typeProgram(program);
};

const expectEffects = (code: string, expectedEffects: Effect[]) => {
	const result = runNoolang(code);
	const actualEffects = Array.from(result.effects).sort();
	const expected = expectedEffects.sort();
	expect(actualEffects).toEqual(expected);
	return result;
};

const expectPure = (code: string) => {
	const result = runNoolang(code);
	expect(result.effects.size).toBe(0);
	return result;
};

describe('Effects Phase 3: Effect Validation and Built-in Functions', () => {
	describe('Built-in Effectful Functions', () => {
		test('print function has write effect', () => {
			expectEffects('print 42', ['write']);
		});

		test('println function has write effect', () => {
			expectEffects('println "hello"', ['write']);
		});

		test('log function has log effect', () => {
			expectEffects('log "debug message"', ['log']);
		});

		test('readFile function has read effect', () => {
			expectEffects('readFile "test.txt"', ['read']);
		});

		test('writeFile function has write effect', () => {
			expectEffects('writeFile "test.txt" "content"', ['write']);
		});

		test('random function has rand effect', () => {
			expectEffects('random', ['rand']);
		});

		test('randomRange function has rand effect', () => {
			expectEffects('randomRange 1 10', ['rand']);
		});

		test('mutSet function has state effect', () => {
			expectEffects(
				`
				ref = "someRef";
				mutSet ref 42
			`,
				['state']
			);
		});

		test('mutGet function has state effect', () => {
			expectEffects(
				`
				ref = "someRef";
				mutGet ref
			`,
				['state']
			);
		});
	});

	describe('Effect Propagation in Function Composition', () => {
		test('function calling effectful function inherits effects', () => {
			expectEffects(
				`
				logAndReturn = fn x => print x;
				logAndReturn 42
			`,
				['write']
			);
		});

		test('multiple effectful calls accumulate effects', () => {
			expectEffects(
				`
				logAndRead = fn filename => (
					log "Reading file";
					readFile filename
				);
				logAndRead "test.txt"
			`,
				['log', 'read']
			);
		});

		test('nested function calls propagate effects', () => {
			expectEffects(
				`
				helper = fn x => print x;
				wrapper = fn x => helper (x + 1);
				wrapper 5
			`,
				['write']
			);
		});

		test('pipeline operations propagate effects', () => {
			expectEffects(
				`
				logger = fn x => print x;
				42 | logger
			`,
				['write']
			);
		});

		test('composed functions merge effects', () => {
			expectEffects(
				`
				printer = fn x => print x;
				randomizer = fn _ => random;
				compose = fn f => fn g => fn x => f (g x);
				randomPrint = compose printer randomizer;
				randomPrint 0
			`,
				['rand', 'write']
			);
		});
	});

	describe('Effect Propagation in Data Structures', () => {
		test('lists with effectful elements propagate effects', () => {
			expectEffects(
				`
				[print 1, print 2, print 3]
			`,
				['write']
			);
		});

		test('records with effectful field values propagate effects', () => {
			expectEffects(
				`
				{ @logged print 42, @random random }
			`,
				['rand', 'write']
			);
		});

		test('tuples with effectful elements propagate effects', () => {
			expectEffects(
				`
				{print 1, random, readFile "test.txt"}
			`,
				['rand', 'read', 'write']
			);
		});
	});

	describe('Effect Propagation in Control Flow', () => {
		test('conditionals with effectful branches propagate effects', () => {
			expectEffects(
				`
				condition = True;
				if condition then (print "yes"; {}) else (log "no"; {})
			`,
				['log', 'write']
			);
		});

		test('conditionals merge effects from both branches', () => {
			expectEffects(
				`
				x = 5;
				if x > 0 then (print x; {}) else (random; {})
			`,
				['rand', 'write']
			);
		});

		test('nested conditionals accumulate effects', () => {
			expectEffects(
				`
				x = 5;
				if x > 0 then (
					if x > 10 then (readFile "big.txt"; {}) else (print x; {})
				) else (log "negative"; {})
			`,
				['log', 'read', 'write']
			);
		});
	});

	describe('Effect Propagation in Pattern Matching', () => {
		test('pattern matching with effectful cases propagates effects', () => {
			expectEffects(
				`
				type Option a = Some a | None;
				opt = Some 42;
				match opt with (
					Some x => (print x; {});
					None => (log "empty"; {})
				)
			`,
				['log', 'write']
			);
		});

		test('pattern matching merges effects from all cases', () => {
			expectEffects(
				`
				type Result a b = Ok a | Err b;
				result = Ok 42;
				match result with (
					Ok value => print value;
					Err msg => (log msg; random)
				)
			`,
				['log', 'rand', 'write']
			);
		});
	});

	describe('Higher-order Functions with Effects', () => {
		test('map with effectful function propagates effects', () => {
			expectEffects(
				`
				numbers = [1, 2, 3];
				logger = fn x => print x;
				map logger numbers
			`,
				['write']
			);
		});

		test('filter with effectful predicate propagates effects', () => {
			expectEffects(
				`
				numbers = [1, 2, 3, 4, 5];
				effectfulPred = fn x => (print x; x > 2);
				filter effectfulPred numbers
			`,
				['write']
			);
		});

		test('reduce with effectful function propagates effects', () => {
			expectEffects(
				`
				numbers = [1, 2, 3];
				effectfulSum = fn acc => fn x => (
					print x;
					acc + x
				);
				reduce effectfulSum 0 numbers
			`,
				['write']
			);
		});
	});

	describe('Complex Effect Combinations', () => {
		test('function with multiple effect types', () => {
			expectEffects(
				`
				complexFunction = fn filename => (
					num = random;
					log (concat "Processing: " filename);
					content = readFile filename;
					print content;
					num
				);
				complexFunction "data.txt"
			`,
				['log', 'rand', 'read', 'write']
			);
		});

		test('recursive function with effects', () => {
			expectEffects(
				`
				logCount = fn n => (
					print n;
					if n > 0 then logCount (n - 1) else 0
				);
				logCount 3
			`,
				['write']
			);
		});

		test('recursive functions with different effects', () => {
			expectEffects(
				`
				helper = fn n effect => (
					if effect == "log" then (log "message"; {}) else (print "message"; {});
					if n > 0 then helper (n - 1) "log" else {}
				);
				helper 2 "print"
			`,
				['log', 'write']
			);
		});
	});

	describe('Effect System Architecture Validation', () => {
		test('pure functions have no effects', () => {
			expectPure('fn x => x + 1');
		});

		test('pure function application has no effects', () => {
			expectPure(`
				add = fn x => fn y => x + y;
				add 2 3
			`);
		});

		test('effect propagation is transitive', () => {
			expectEffects(
				`
				level1 = fn x => print x;
				level2 = fn x => level1 (x * 2);
				level3 = fn x => level2 (x + 1);
				level3 5
			`,
				['write']
			);
		});

		test('effects are properly unioned across expressions', () => {
			expectEffects(
				`
				a = print 1;     # write
				b = random;      # rand
				c = readFile "test"; # read
				{a, b, c}
			`,
				['rand', 'read', 'write']
			);
		});

		test('function returning function preserves effects', () => {
			expectEffects(
				`
				makePrinter = fn prefix => fn x => print (concat prefix x);
				logger = makePrinter "LOG: ";
				logger "message"
			`,
				['write']
			);
		});
	});

	describe('Effect Type System Integration', () => {
		test('TypeResult includes effects field for effectful expressions', () => {
			const result = runNoolang('print 42');
			expect(result).toHaveProperty('type');
			expect(result).toHaveProperty('effects');
			expect(result).toHaveProperty('state');
			expect(result.effects).toBeInstanceOf(Set);
			expect(result.effects.has('write')).toBe(true);
		});

		test('TypeResult includes effects field for pure expressions', () => {
			const result = runNoolang('42');
			expect(result).toHaveProperty('type');
			expect(result).toHaveProperty('effects');
			expect(result).toHaveProperty('state');
			expect(result.effects).toBeInstanceOf(Set);
			expect(result.effects.size).toBe(0);
		});

		test('complex expressions have proper effect composition', () => {
			const result = runNoolang(`
				loggedRandom = fn seed => (
					log "generating random";
					randomRange seed (seed + 10)
				);
				loggedRandom 5
			`);
			expect(result.effects.has('log')).toBe(true);
			expect(result.effects.has('rand')).toBe(true);
			expect(result.effects.size).toBe(2);
		});
	});

	describe('Effect Validation Edge Cases', () => {
		test('empty function has no effects', () => {
			expectPure('fn _ => 42');
		});

		test('function with multiple pure operations has no effects', () => {
			expectPure(`
				compute = fn x => (
					a = x + 1;
					b = a * 2;
					c = b - 3;
					c
				);
				compute 5
			`);
		});

		test('partially applied effectful function preserves effects', () => {
			expectEffects(
				`
				writePartial = writeFile "output.txt";
				writePartial "hello world"
			`,
				['write']
			);
		});

		test('curried effectful function composition', () => {
			expectEffects(
				`
				writer = writeFile "output.txt";
				writer "content"
			`,
				['write']
			);
		});
	});
});
