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

test('arithmetic operations complete quickly', () => {
    const input = `
        let a = 1.0 + 2.0 in
        let b = a * 3.0 in
        let c = b - 4.0 in
        [a, b, c]
    `;
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete quickly
    assert.ok(endTime - startTime < 500, `Type checking took ${endTime - startTime}ms, expected < 500ms`);
    
    // Should not have excessive unification calls
    if (stats) {
        assert.ok(stats.calls < 1000, `Used ${stats.calls} unification calls, expected < 1000`);
    }
    
    // Should return List Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test('equality operations remain performant', () => {
    const input = `
        let eq1 = 1.0 == 1.0 in
        let eq2 = 2.0 == 3.0 in
        let eq3 = "hello" == "world" in
        [eq1, eq2, eq3]
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

test('nested function application performs well', () => {
    const input = `
        let add = fn x y => x + y in
        let mul = fn x y => x * y in
        let result1 = add 1.0 2.0 in
        let result2 = mul result1 3.0 in
        result2
    `;
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete quickly
    assert.ok(endTime - startTime < 600, `Type checking took ${endTime - startTime}ms, expected < 600ms`);
    
    // Should not have excessive unification calls
    if (stats) {
        assert.ok(stats.calls < 1200, `Used ${stats.calls} unification calls, expected < 1200`);
    }
    
    // Should return Float
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'Float');
});

test('stdlib loading does not cause performance regression', () => {
    // Simple expression that uses stdlib functions
    const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
    
    resetUnificationCounters();
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    const stats = getUnificationStats();
    
    // Should complete in reasonable time even with stdlib loading
    assert.ok(endTime - startTime < 2000, `Type checking took ${endTime - startTime}ms, expected < 2000ms`);
    
    // Should return List Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test.run();