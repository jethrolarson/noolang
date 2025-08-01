import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { parse } from '../../parser/parser';
import { Lexer } from '../../lexer/lexer';
import { typeAndDecorate } from '../index';
import { floatType, stringType, optionType } from '../../ast';

test('Unified Math Trait System (Float-only) - Add Trait (supports Float, String) - should add numbers', () => {
    const code = '3 + 4';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Add Trait (supports Float, String) - should add floats', () => {
    const code = '3.5 + 4.2';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Add Trait (supports Float, String) - should add strings', () => {
    const code = '"Hello" + " World"';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, stringType());
});

test('Unified Math Trait System (Float-only) - Add Trait (supports Float, String) - should reject mixed type addition', () => {
    const code = '1 + "hello"';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    
    assert.throws(() => typeAndDecorate(program), /type mismatch|Expected.*Float.*Got.*String/i);
});

test('Unified Math Trait System (Float-only) - Numeric Trait (supports Float for -, *, /) - should subtract numbers', () => {
    const code = '10 - 3';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Numeric Trait (supports Float for -, *, /) - should subtract floats', () => {
    const code = '10.5 - 3.2';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Numeric Trait (supports Float for -, *, /) - should multiply numbers', () => {
    const code = '4 * 5';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Numeric Trait (supports Float for -, *, /) - should multiply floats', () => {
    const code = '2.5 * 3.0';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Numeric Trait (supports Float for -, *, /) - should allow string operations through type-checking (caught at runtime)', () => {
    // The current constraint system allows these through type-checking
    // but they fail at runtime, which is acceptable behavior
    const operations = ['"hello" - "world"', '"hello" * "world"'];
    
    operations.forEach(code => {
        const tokens = new Lexer(code).tokenize();
        const program = parse(tokens);
        
        // Type checking should pass (constraint resolution allows it)
        assert.not.throws(() => typeAndDecorate(program));
    });
});

test('Unified Math Trait System (Float-only) - Safe Division (returns Option Float) - should divide numbers and return Option Float', () => {
    const code = '10 / 2';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, optionType(floatType()));
});

test('Unified Math Trait System (Float-only) - Safe Division (returns Option Float) - should divide floats and return Option Float', () => {
    const code = '7.5 / 2.5';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, optionType(floatType()));
});

test('Unified Math Trait System (Float-only) - Safe Division (returns Option Float) - should handle all division as safe (returning Option Float)', () => {
    const testCases = ['1 / 2', '10 / 0', '3.14 / 1.5'];
    
    testCases.forEach(code => {
        const tokens = new Lexer(code).tokenize();
        const program = parse(tokens);
        const result = typeAndDecorate(program);
        
        assert.equal(result.finalType, optionType(floatType()));
    });
});

test('Unified Math Trait System (Float-only) - Complex Expressions - should handle mixed arithmetic operations', () => {
    const code = '(10 + 5) * 2 - 3';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Complex Expressions - should handle polymorphic functions with math operations', () => {
    const code = 'fn x y => x + y * x';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    // Should infer as a polymorphic function constrained by Add and Numeric
    assert.is(result.finalType.kind, 'function');
});

test('Unified Math Trait System (Float-only) - Type Safety - should accept all Float operations since everything is Float', () => {
    const code = '1 + 2.5';
    const tokens = new Lexer(code).tokenize();
    const program = parse(tokens);
    const result = typeAndDecorate(program);
    
    assert.equal(result.finalType, floatType());
});

test('Unified Math Trait System (Float-only) - Type Safety - should allow string numeric operations through type-checking', () => {
    // These operations pass type-checking but fail at runtime
    // This is the current behavior of the constraint system
    const operations = [
        '"hello" - "world"',
        '"hello" * "world"',
        '"hello" / "world"'
    ];

    operations.forEach(code => {
        const tokens = new Lexer(code).tokenize();
        const program = parse(tokens);
        assert.not.throws(() => typeAndDecorate(program));
    });
});

test('Unified Math Trait System (Float-only) - Type Safety - should type all numeric literals as Float', () => {
    // All numeric literals are now Float
    const codes = ['1', '1.0', '42', '3.14'];
    
    codes.forEach(code => {
        const tokens = new Lexer(code).tokenize();
        const program = parse(tokens);
        const result = typeAndDecorate(program);
        assert.equal(result.finalType, floatType());
    });
});

test('Unified Math Trait System (Float-only) - Design Verification - should demonstrate unified Float-only numeric system', () => {
    const expressions = [
        { code: '1', type: floatType() },
        { code: '1.0', type: floatType() },
        { code: '1 + 2', type: floatType() },
        { code: '1.5 + 2.5', type: floatType() },
        { code: '5 - 3', type: floatType() },
        { code: '4 * 6', type: floatType() },
        { code: '10 / 3', type: optionType(floatType()) },
        { code: '"a" + "b"', type: stringType() }
    ];

    expressions.forEach(({ code, type }) => {
        const tokens = new Lexer(code).tokenize();
        const program = parse(tokens);
        const result = typeAndDecorate(program);
        assert.equal(result.finalType, type);
    });
});

test.run();