import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { typeProgram } from '../index';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { resetUnificationCounters, getUnificationStats } from '../unify';

// Helper function to parse and type check a string
const typeString = (input: string) => {
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    return typeProgram(ast);
};

test('safe thrush operator chains do not cause exponential unification', () => {
    const input = `
        Some 5 
        |? (fn x => x + 1) 
        |? (fn x => x * 2) 
        |? (fn x => x - 1)
    `;
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete quickly (under 500ms)
    assert.ok(endTime - startTime < 500, `Type checking took ${endTime - startTime}ms, expected < 500ms`);
    
    // Should not have exponential unification calls (less than 1000 calls)
    if (stats) {
        assert.ok(stats.calls < 1000, `Used ${stats.calls} unification calls, expected < 1000`);
    }
    
    // Should return Option Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'Option');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test('complex filter operations complete in reasonable time', () => {
    const input = `
        let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] in
        let evens = filter (fn x => equals (x % 2) 0) numbers in
        let doubled = map (fn x => x * 2) evens in
        filter (fn x => x > 5) doubled
    `;
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete quickly
    assert.ok(endTime - startTime < 1000, `Type checking took ${endTime - startTime}ms, expected < 1000ms`);
    
    // Should not have excessive unification calls
    if (stats) {
        assert.ok(stats.calls < 2000, `Used ${stats.calls} unification calls, expected < 2000`);
    }
    
    // Should return List Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test('nested trait function applications remain performant', () => {
    const input = `
        let test_eq = fn x y => equals x y in
        let apply_test = fn f a b => f a b in
        let result1 = apply_test test_eq 1 1 in
        let result2 = apply_test test_eq 2 3 in
        [result1, result2]
    `;
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete quickly
    assert.ok(endTime - startTime < 800, `Type checking took ${endTime - startTime}ms, expected < 800ms`);
    
    // Should not have excessive unification calls
    if (stats) {
        assert.ok(stats.calls < 1500, `Used ${stats.calls} unification calls, expected < 1500`);
    }
    
    // Should return List Bool
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Bool');
});

test('stdlib loading does not cause performance regression', () => {
    // Simple expression that requires stdlib
    const input = 'head [1, 2, 3]';
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete in reasonable time even with stdlib loading
    assert.ok(endTime - startTime < 2000, `Type checking took ${endTime - startTime}ms, expected < 2000ms`);
    
    // Should return Option Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'Option');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test.run();