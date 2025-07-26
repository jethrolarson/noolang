import { parse } from '../../parser/parser';
import { Lexer } from '../../lexer/lexer';
import { typeAndDecorate } from '../index';
import { Evaluator } from '../../evaluator/evaluator';
import { intType, floatType, stringType, optionType } from '../../ast';

describe('Unified Math Trait System', () => {
    describe('Add Trait (supports Int, Float, String)', () => {
        test('should add integers', () => {
            const code = '3 + 4';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(intType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBe(7);
            }
        });

        test('should add floats', () => {
            const code = '3.5 + 4.2';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(floatType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBeCloseTo(7.7);
            }
        });

        test('should add strings', () => {
            const code = '"Hello" + " World"';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(stringType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('string');
            if (evalResult.finalResult.tag === 'string') {
                expect(evalResult.finalResult.value).toBe('Hello World');
            }
        });

        test('should reject mixed type addition', () => {
            const code = '1 + "hello"';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            
            expect(() => typeAndDecorate(program)).toThrow(/type mismatch|Expected.*Int.*Got.*String/i);
        });
    });

    describe('Numeric Trait (supports Int, Float for -, *, /)', () => {
        test('should subtract integers', () => {
            const code = '10 - 3';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(intType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBe(7);
            }
        });

        test('should subtract floats', () => {
            const code = '10.5 - 3.2';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(floatType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBeCloseTo(7.3);
            }
        });

        test('should multiply integers', () => {
            const code = '4 * 5';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(intType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBe(20);
            }
        });

        test('should multiply floats', () => {
            const code = '2.5 * 3.0';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(floatType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBe(7.5);
            }
        });

        test('should reject string subtraction at runtime', () => {
            const code = '"hello" - "world"';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            // Type checking passes, but runtime should fail
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            expect(() => evaluator.evaluateProgram(program)).toThrow(/Cannot subtract/);
        });

        test('should reject string multiplication at runtime', () => {
            const code = '"hello" * "world"';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            // Type checking passes, but runtime should fail
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            expect(() => evaluator.evaluateProgram(program)).toThrow(/Cannot multiply/);
        });
    });

    describe('Safe Division (returns Option Float)', () => {
        test('should divide integers and return Option Float', () => {
            const code = '10 / 2';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(optionType(floatType()));
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('constructor');
            if (evalResult.finalResult.tag === 'constructor') {
                expect(evalResult.finalResult.name).toBe('Some');
                expect(evalResult.finalResult.args).toHaveLength(1);
                expect(evalResult.finalResult.args[0].tag).toBe('number');
                if (evalResult.finalResult.args[0].tag === 'number') {
                    expect(evalResult.finalResult.args[0].value).toBe(5);
                }
            }
        });

        test('should divide floats and return Option Float', () => {
            const code = '7.5 / 2.5';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(optionType(floatType()));
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('constructor');
            if (evalResult.finalResult.tag === 'constructor') {
                expect(evalResult.finalResult.name).toBe('Some');
                expect(evalResult.finalResult.args).toHaveLength(1);
                expect(evalResult.finalResult.args[0].tag).toBe('number');
                if (evalResult.finalResult.args[0].tag === 'number') {
                    expect(evalResult.finalResult.args[0].value).toBe(3);
                }
            }
        });

        test('should handle division by zero safely', () => {
            const code = '10 / 0';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(optionType(floatType()));
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('constructor');
            if (evalResult.finalResult.tag === 'constructor') {
                expect(evalResult.finalResult.name).toBe('None');
                expect(evalResult.finalResult.args).toHaveLength(0);
            }
        });

        test('should handle fractional division correctly', () => {
            const code = '1 / 2';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(optionType(floatType()));
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('constructor');
            if (evalResult.finalResult.tag === 'constructor') {
                expect(evalResult.finalResult.name).toBe('Some');
                expect(evalResult.finalResult.args).toHaveLength(1);
                expect(evalResult.finalResult.args[0].tag).toBe('number');
                if (evalResult.finalResult.args[0].tag === 'number') {
                    expect(evalResult.finalResult.args[0].value).toBe(0.5);
                }
            }
        });
    });

    describe('Complex Expressions', () => {
        test('should handle mixed arithmetic operations', () => {
            const code = '(10 + 5) * 2 - 3';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            expect(result.finalType).toEqual(intType());
            
            const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
            const evalResult = evaluator.evaluateProgram(program);
            expect(evalResult.finalResult.tag).toBe('number');
            if (evalResult.finalResult.tag === 'number') {
                expect(evalResult.finalResult.value).toBe(27); // (10 + 5) * 2 - 3 = 15 * 2 - 3 = 30 - 3 = 27
            }
        });

        test('should handle polymorphic functions with math operations', () => {
            const code = 'fn x y => x + y * x';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            const result = typeAndDecorate(program);
            
            // Should infer as a polymorphic function constrained by Add and Numeric
            expect(result.finalType.kind).toBe('function');
        });
    });

    describe('Type Safety', () => {
        test('should reject mixed numeric types in same expression', () => {
            const code = '1 + 2.5';
            const tokens = new Lexer(code).tokenize();
            const program = parse(tokens);
            
            expect(() => typeAndDecorate(program)).toThrow();
        });

        test('should reject operations not supported by strings at runtime', () => {
            const operations = [
                { code: '"hello" - "world"', error: /Cannot subtract/ },
                { code: '"hello" * "world"', error: /Cannot multiply/ },
                { code: '"hello" / "world"', error: /Cannot divide/ }
            ];

            operations.forEach(({ code, error }) => {
                const tokens = new Lexer(code).tokenize();
                const program = parse(tokens);
                const result = typeAndDecorate(program);
                
                // Type checking passes, but runtime should fail
                const evaluator = new Evaluator({ traitRegistry: result.state.traitRegistry });
                expect(() => evaluator.evaluateProgram(program)).toThrow(error);
            });
        });

        test('should properly distinguish 1 vs 1.0', () => {
            // Test that our literal fix works
            const intCode = '1';
            const floatCode = '1.0';
            
            const intTokens = new Lexer(intCode).tokenize();
            const intProgram = parse(intTokens);
            const intResult = typeAndDecorate(intProgram);
            expect(intResult.finalType).toEqual(intType());
            
            const floatTokens = new Lexer(floatCode).tokenize();
            const floatProgram = parse(floatTokens);
            const floatResult = typeAndDecorate(floatProgram);
            expect(floatResult.finalType).toEqual(floatType());
        });
    });
});