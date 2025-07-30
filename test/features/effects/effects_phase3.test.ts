// Phase 3 Effects System Tests
// Testing effect validation, propagation, and built-in effectful functions

import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeProgram } from '../../../src/typer';
import type { Effect } from '../../../src/ast';
import { describe, test, expect } from 'bun:test';

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
	expect(result.effects.size).toEqual(0);
	return result;
};

// Test suite: Effects Phase 3: Effect Validation and Built-in Functions
test('Effects Phase 3 - Built-in Effectful Functions - print function has write effect', () => {
	expectEffects('print 42', ['write']);
});

test('Effects Phase 3 - Built-in Effectful Functions - println function has write effect', () => {
	expectEffects('println "hello"', ['write']);
});

test('Effects Phase 3 - Built-in Effectful Functions - log function has log effect', () => {
	expectEffects('log "debug message"', ['log']);
});

test('Effects Phase 3 - Built-in Effectful Functions - readFile function has read effect', () => {
	expectEffects('readFile "test.txt"', ['read']);
});

test('Effects Phase 3 - Built-in Effectful Functions - writeFile function has write effect', () => {
	expectEffects('writeFile "test.txt" "content"', ['write']);
});

test('Effects Phase 3 - Built-in Effectful Functions - random function has rand effect', () => {
	expectEffects('random', ['rand']);
});

test('Effects Phase 3 - Built-in Effectful Functions - randomRange function has rand effect', () => {
	expectEffects('randomRange 1 10', ['rand']);
});

test('Effects Phase 3 - Built-in Effectful Functions - mutSet function has state effect', () => {
	expectEffects(
		`
				ref = "someRef";
				mutSet ref 42
			`,
		['state']
	);
});

test('Effects Phase 3 - Built-in Effectful Functions - mutGet function has state effect', () => {
	expectEffects(
		`
				ref = "someRef";
				mutGet ref
			`,
		['state']
	);
});

test('Effects Phase 3 - Effect Propagation in Function Composition - function calling effectful function inherits effects', () => {
	expectEffects(
		`
				logAndReturn = fn x => print x;
				logAndReturn 42
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Propagation in Function Composition - multiple effectful calls accumulate effects', () => {
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

test('Effects Phase 3 - Effect Propagation in Function Composition - nested function calls propagate effects', () => {
	expectEffects(
		`
				helper = fn x => print x;
				wrapper = fn x => helper (x + 1);
				wrapper 5
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Propagation in Function Composition - pipeline operations propagate effects', () => {
	expectEffects(
		`
				logger = fn x => print x;
				42 | logger
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Propagation in Function Composition - composed functions merge effects', () => {
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

test('Effects Phase 3 - Effect Propagation in Data Structures - lists with effectful elements propagate effects', () => {
	expectEffects(
		`
				[print 1, print 2, print 3]
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Propagation in Data Structures - records with effectful field values propagate effects', () => {
	expectEffects(
		`
				{ @logged print 42, @random random }
			`,
		['rand', 'write']
	);
});

test('Effects Phase 3 - Effect Propagation in Data Structures - tuples with effectful elements propagate effects', () => {
	expectEffects(
		`
				{print 1, random, readFile "test.txt"}
			`,
		['rand', 'read', 'write']
	);
});

test('Effects Phase 3 - Effect Propagation in Control Flow - conditionals with effectful branches propagate effects', () => {
	expectEffects(
		`
				condition = True;
				if condition then (print "yes"; {}) else (log "no"; {})
			`,
		['log', 'write']
	);
});

test('Effects Phase 3 - Effect Propagation in Control Flow - conditionals merge effects from both branches', () => {
	expectEffects(
		`
				x = 5;
				if x > 0 then (print x; {}) else (random; {})
			`,
		['rand', 'write']
	);
});

test('Effects Phase 3 - Effect Propagation in Control Flow - nested conditionals accumulate effects', () => {
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

test('Effects Phase 3 - Effect Propagation in Pattern Matching - pattern matching with effectful cases propagates effects', () => {
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

test('Effects Phase 3 - Effect Propagation in Pattern Matching - pattern matching merges effects from all cases', () => {
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

test('Effects Phase 3 - Higher-order Functions with Effects - map with effectful function propagates effects', () => {
	expectEffects(
		`
				numbers = [1, 2, 3];
				logger = fn x => print x;
				list_map logger numbers
			`,
		['write']
	);
});

test('Effects Phase 3 - Higher-order Functions with Effects - filter with effectful predicate propagates effects', () => {
	expectEffects(
		`
				numbers = [1, 2, 3, 4, 5];
				effectfulPred = fn x => (print x; x > 2);
				filter effectfulPred numbers
			`,
		['write']
	);
});

test('Effects Phase 3 - Higher-order Functions with Effects - reduce with effectful function propagates effects', () => {
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

test('Effects Phase 3 - Complex Effect Combinations - function with multiple effect types', () => {
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

test('Effects Phase 3 - Complex Effect Combinations - recursive function with effects', () => {
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

test('Effects Phase 3 - Complex Effect Combinations - recursive functions with different effects', () => {
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

test('Effects Phase 3 - Effect System Architecture Validation - pure functions have no effects', () => {
	expectPure('fn x => x + 1');
});

test('Effects Phase 3 - Effect System Architecture Validation - pure function application has no effects', () => {
	expectPure(`
				sum = fn x => fn y => x + y;
				sum 2 3
			`);
});

test('Effects Phase 3 - Effect System Architecture Validation - effect propagation is transitive', () => {
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

test('Effects Phase 3 - Effect System Architecture Validation - effects are properly unioned across expressions', () => {
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

test('Effects Phase 3 - Effect System Architecture Validation - function returning function preserves effects', () => {
	expectEffects(
		`
				makePrinter = fn prefix => fn x => print (concat prefix x);
				logger = makePrinter "LOG: ";
				logger "message"
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Type System Integration - TypeResult includes effects field for effectful expressions', () => {
	const result = runNoolang('print 42');
	expect(expect(result.hasOwnProperty('type').toBeTruthy(), 'result should have type property');
	expect(expect(result.hasOwnProperty('effects').toBeTruthy(), 'result should have effects property');
	expect(expect(result.hasOwnProperty('state').toBeTruthy(), 'result should have state property');
	expect(expect(result.effects instanceof Set, 'effects should be a Set').toBeTruthy();
	expect(expect(result.effects.has('write').toBeTruthy(), 'effects should contain write effect');
});

test('Effects Phase 3 - Effect Type System Integration - TypeResult includes effects field for pure expressions', () => {
	const result = runNoolang('42');
	expect(expect(result.hasOwnProperty('type').toBeTruthy(), 'result should have type property');
	expect(expect(result.hasOwnProperty('effects').toBeTruthy(), 'result should have effects property');
	expect(expect(result.hasOwnProperty('state').toBeTruthy(), 'result should have state property');
	expect(expect(result.effects instanceof Set, 'effects should be a Set').toBeTruthy();
	expect(result.effects.size).toEqual(0, 'pure expression should have no effects');
});

test('Effects Phase 3 - Effect Type System Integration - complex expressions have proper effect composition', () => {
	const result = runNoolang(`
				loggedRandom = fn seed => (
					log "generating random";
					randomRange seed (seed + 10)
				);
				loggedRandom 5
			`);
	expect(expect(result.effects.has('log').toBeTruthy(), 'effects should contain log effect');
	expect(expect(result.effects.has('rand').toBeTruthy(), 'effects should contain rand effect');
	expect(result.effects.size).toEqual(2, 'should have exactly 2 effects');
});

test('Effects Phase 3 - Effect Validation Edge Cases - empty function has no effects', () => {
	expectPure('fn _ => 42');
});

test('Effects Phase 3 - Effect Validation Edge Cases - function with multiple pure operations has no effects', () => {
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

test('Effects Phase 3 - Effect Validation Edge Cases - partially applied effectful function preserves effects', () => {
	expectEffects(
		`
				writePartial = writeFile "output.txt";
				writePartial "hello world"
			`,
		['write']
	);
});

test('Effects Phase 3 - Effect Validation Edge Cases - curried effectful function composition', () => {
	expectEffects(
		`
				writer = writeFile "output.txt";
				writer "content"
			`,
		['write']
	);
});

