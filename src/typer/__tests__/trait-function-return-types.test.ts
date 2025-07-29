import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { typeProgram } from '../index';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

// Helper function to parse and type check a string
const typeString = (input: string) => {
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    return typeProgram(ast);
};

test('built-in equality operator returns Bool type', () => {
    const input = '1.0 == 2.0';
    const result = typeString(input);
    
    // This was the core issue - equality was returning type variables instead of Bool
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'Bool');
});

test('string equality returns Bool type', () => {
    const input = '"hello" == "world"';
    const result = typeString(input);
    
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'Bool');
});

test('equality in lambda functions resolves correctly', () => {
    const input = 'fn x => x == 1.0';
    const result = typeString(input);
    
    // Should be a function type: Float -> Bool
    assert.equal(result.type.kind, 'function');
    assert.equal(result.type.params.length, 1);
    assert.equal(result.type.params[0].kind, 'primitive');
    assert.equal(result.type.params[0].name, 'Float');
    assert.equal(result.type.return.kind, 'variant');
    assert.equal(result.type.return.name, 'Bool');
});

test('map with basic function works correctly', () => {
    const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
    const result = typeString(input);
    
    // Should return List Float
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'primitive');
    assert.equal(result.type.element.name, 'Float');
});

test('nested arithmetic expressions type correctly', () => {
    const input = '(1.0 + 2.0) * (3.0 - 4.0)';
    const result = typeString(input);
    
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'Float');
});

test('variables and boolean operations complete without exponential unification', () => {
    const program = `
        a = 1.0 == 1.0;
        b = 2.0 == 2.0;
        c = 3.0 == 3.0;
        result = [a, b, c];
        result
    `;
    
    const startTime = Date.now();
    const result = typeString(program);
    const endTime = Date.now();
    
    // Should complete quickly - this was slow before our fixes
    assert.ok(endTime - startTime < 500, `Type checking took ${endTime - startTime}ms, expected < 500ms`);
    
    // Should return List Bool
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'variant');
    assert.equal(result.type.element.name, 'Bool');
});

test.run();