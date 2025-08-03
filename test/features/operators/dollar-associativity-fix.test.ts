import { test } from 'bun:test';
import { expectError, expectSuccess } from '../../utils';

// Test what currently works with $ operator
test('$ operator basic functionality works', () => {
	expectSuccess(
		`
        f = fn x => x * 2;
        result = f $ 5;
        result
    `,
		10
	);
});

test('$ operator with curried functions works', () => {
	expectSuccess(
		`
        sum = fn x => fn y => x + y;
        sum5 = sum $ 5;
        result = sum5 $ 3;
        result
    `,
		8
	);
});

// Test the specific associativity issue
test('$ operator associativity - what fails', () => {
	// This fails because f expects 3 args but gets applied incrementally
	expectError(`
        f = fn a b c => a + b + c;
        result = f $ 1 $ 2 $ 3;
        result
    `);
});

test('$ operator associativity - manual workaround', () => {
	// This works with explicit currying
	expectSuccess(
		`
        f = fn a => fn b => fn c => a + b + c;
        result = ((f $ 1) $ 2) $ 3;
        result
    `,
		6
	);
});

test('$ operator associativity - test right associativity', () => {
	// Test if $ is truly right associative: f $ g $ h = f $ (g $ h)
	expectSuccess(
		`
        const = fn x => fn y => x;
        id = fn x => x;
        result = const $ id $ 42;
        result "dummy"
    `,
		42
	);
});

test('$ operator parser behavior investigation', () => {
	expectSuccess(
		`
        const = fn x => fn y => x;
        result = const $ 5;
        result "dummy"
    `,
		5
	);
});

test('$ operator nested application', () => {
	expectSuccess(
		`
        f = fn x => fn y => x + y;
        g = fn x => x * 2;
        result = f $ (g $ 3);
        result $ 4
    `,
		10
	);
});

test('investigate parsing vs type checking', () => {
	expectSuccess(
		`
        sum = fn x => fn y => x + y;
        result = (sum $ 1) $ 2;
        result
    `,
		3
	);
});
