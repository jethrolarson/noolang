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
        a = 1.0 + 2.0;
        b = a * 3.0;
        c = b - 4.0;
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
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'primitive');
    assert.equal(result.type.element.name, 'Float');
});

test('equality operations remain performant', () => {
    const input = `
        eq1 = 1.0 == 1.0;
        eq2 = 2.0 == 3.0;
        eq3 = "hello" == "world";
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
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'variant');
    assert.equal(result.type.element.name, 'Bool');
});

test('nested function application performs well', () => {
    const input = `
        myAdd = fn x y => x + y;
        myMul = fn x y => x * y;
        result1 = myAdd 1.0 2.0;
        result2 = myMul result1 3.0;
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
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'primitive');
    assert.equal(result.type.element.name, 'Float');
});

test.run();