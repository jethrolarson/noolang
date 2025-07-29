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

test('trait function equals returns Bool type, not type variable', () => {
    const input = 'equals 1 1';
    const result = typeString(input);
    
    // The type should be Bool, not a type variable
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'Bool');
});

test('filter with equals function works correctly', () => {
    const input = 'filter (fn x => equals x 3) [1, 2, 3, 4, 5]';
    const result = typeString(input);
    
    // Should return List Float
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args.length, 1);
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Float');
});

test('chained trait function calls do not cause exponential unification', () => {
    const input = `
        let numbers = [1, 2, 3, 4, 5] in
        let filtered = filter (fn x => equals x 3) numbers in
        map (fn x => equals x 3) filtered
    `;
    
    // This should complete in reasonable time (not exponential)
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    
    // Should complete in under 1000ms (was much slower before fix)
    assert.ok(endTime - startTime < 1000, `Type checking took ${endTime - startTime}ms, expected < 1000ms`);
    
    // Should return List Bool
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Bool');
});

test('built-in equality operator returns Bool', () => {
    const input = '1 == 2';
    const result = typeString(input);
    
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'Bool');
});

test('lambda with trait function constraint resolves correctly', () => {
    const input = 'fn x => equals x 1';
    const result = typeString(input);
    
    // Should be a function type: Float -> Bool
    assert.equal(result.type.kind, 'function');
    assert.equal(result.type.params.length, 1);
    assert.equal(result.type.params[0].kind, 'primitive');
    assert.equal(result.type.params[0].name, 'Float');
    assert.equal(result.type.return.kind, 'primitive');
    assert.equal(result.type.return.name, 'Bool');
});

test('nested trait function calls resolve without exponential blowup', () => {
    const input = `
        let eq1 = equals 1 1 in
        let eq2 = equals 2 2 in
        let eq3 = equals 3 3 in
        [eq1, eq2, eq3]
    `;
    
    const startTime = Date.now();
    const result = typeString(input);
    const endTime = Date.now();
    
    // Should complete quickly
    assert.ok(endTime - startTime < 500, `Type checking took ${endTime - startTime}ms, expected < 500ms`);
    
    // Should return List Bool
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'List');
    assert.equal(result.type.args[0].kind, 'primitive');
    assert.equal(result.type.args[0].name, 'Bool');
});

test.run();