import { Lexer } from '../src/lexer';

describe('Lexer - comments', () => {
  test('should skip single-line comments', () => {
    const codeWithComments = `
      # this is a comment
      x = 5 # inline comment
      y = 10
      # another comment
      x + y # trailing comment
    `;
    const codeWithoutComments = `
      x = 5
      y = 10
      x + y
    `;
    const tokensWithComments = new Lexer(codeWithComments).tokenize();
    const tokensWithoutComments = new Lexer(codeWithoutComments).tokenize();
    // Remove location info for comparison
    const stripLoc = (t: any) => ({ type: t.type, value: t.value });
    expect(tokensWithComments.map(stripLoc)).toEqual(tokensWithoutComments.map(stripLoc));
    // Ensure no COMMENT tokens are present
    expect(tokensWithComments.some(t => t.type === 'COMMENT')).toBe(false);
  });
}); 