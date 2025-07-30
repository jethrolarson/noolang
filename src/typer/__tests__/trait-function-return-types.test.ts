import { typeProgram } from '../index';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { describe, test, expect } from 'bun:test';

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
    expect(result.type.kind).toEqual('variant');
    expect(result.type.name).toEqual('Bool');
});

test('string equality returns Bool type', () => {
    const input = '"hello" == "world"';
    const result = typeString(input);
    
    expect(result.type.kind).toEqual('variant');
    expect(result.type.name).toEqual('Bool');
});

test('equality in lambda functions resolves correctly', () => {
    const input = 'fn x => x == 1.0';
    const result = typeString(input);
    
    // Should be a function type: Float -> Bool
    expect(result.type.kind).toEqual('function');
    expect(result.type.params.length).toEqual(1);
    expect(result.type.params[0].kind).toEqual('primitive');
    expect(result.type.params[0].name).toEqual('Float');
    expect(result.type.return.kind).toEqual('variant');
    expect(result.type.return.name).toEqual('Bool');
});

test('map with basic function works correctly', () => {
    const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
    const result = typeString(input);
    
    // Should return List Float
    expect(result.type.kind).toEqual('list');
    expect(result.type.element.kind).toEqual('primitive');
    expect(result.type.element.name).toEqual('Float');
});

test('nested arithmetic expressions type correctly', () => {
    const input = '(1.0 + 2.0) * (3.0 - 4.0)';
    const result = typeString(input);
    
    expect(result.type.kind).toEqual('primitive');
    expect(result.type.name).toEqual('Float');
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
    expect(expect(endTime - startTime < 500, `Type checking took ${endTime - startTime}ms, expected < 500ms`).toBeTruthy();
    
    // Should return List Bool
    expect(result.type.kind).toEqual('list');
    expect(result.type.element.kind).toEqual('variant');
    expect(result.type.element.name).toEqual('Bool');
});

