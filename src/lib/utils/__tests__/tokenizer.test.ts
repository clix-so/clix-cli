import { describe, expect, test } from 'bun:test';
import { countTokens } from '../tokenizer';

describe('countTokens', () => {
  describe('basic functionality', () => {
    test('should return 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    test('should return 0 for null/undefined (as handled by types or runtime)', () => {
      // @ts-expect-error
      expect(countTokens(null)).toBe(0);
    });

    test('should never return negative numbers', () => {
      expect(countTokens('')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('natural language (ASCII)', () => {
    test('should handle short strings', () => {
      expect(countTokens('a')).toBe(0); // 1/4 rounded is 0
      expect(countTokens('ab')).toBe(1); // 2/4 rounded is 1 (Math.round(0.5) = 1)
    });

    test('should estimate tokens for simple sentences (~4 chars/token)', () => {
      const input = 'This is a test sentence.';
      // 24 chars / 4 = 6
      expect(countTokens(input)).toBe(6);
    });

    test('should handle long strings', () => {
      const longString = 'a'.repeat(400);
      expect(countTokens(longString)).toBe(100);
    });

    test('should handle natural English text', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      // 45 chars / 4 ≈ 11 tokens
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThanOrEqual(10);
      expect(tokens).toBeLessThanOrEqual(13);
    });
  });

  describe('code content', () => {
    test('should detect and count TypeScript code', () => {
      const code = `function example(x: number): string {
  const result = x * 2;
  return \`Result: \${result}\`;
}`;
      // ~100 chars with CODE ratio (2.5) = ~40 tokens
      // With NATURAL ratio (4) = ~25 tokens
      const tokens = countTokens(code);
      expect(tokens).toBeGreaterThan(30); // Should be higher than natural language
      expect(tokens).toBeLessThan(50);
    });

    test('should detect JavaScript arrow functions', () => {
      const code = 'const add = (a, b) => a + b;';
      // ~29 chars with CODE ratio = ~12 tokens
      const tokens = countTokens(code);
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(15);
    });

    test('should detect object literals', () => {
      const code = '{ name: "test", value: 42, active: true }';
      // ~42 chars with CODE ratio = ~17 tokens
      const tokens = countTokens(code);
      expect(tokens).toBeGreaterThan(15);
      expect(tokens).toBeLessThan(20);
    });

    test('should handle complex code with multiple patterns', () => {
      const code = `class Example {
  constructor(private value: number) {}

  getValue(): number {
    return this.value;
  }
}`;
      // Should be detected as code and use 2.5 ratio
      const tokens = countTokens(code);
      const naturalTokens = Math.round(code.length / 4);
      expect(tokens).toBeGreaterThan(naturalTokens * 1.3); // At least 30% more than natural
    });
  });

  describe('CJK content', () => {
    test('should count Korean (Hangul) characters', () => {
      const korean = '안녕하세요 반갑습니다';
      // 11 chars (9 Hangul + 1 space + 1 space)
      // CJK chars: 9 * 1.3 = 11.7 tokens
      // Spaces: 2 / 4 = 0.5 tokens
      // Total ≈ 12 tokens
      const tokens = countTokens(korean);
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(15);
    });

    test('should count Chinese characters', () => {
      const chinese = '你好世界这是测试';
      // 8 CJK chars * 1.3 = 10.4 tokens
      const tokens = countTokens(chinese);
      expect(tokens).toBeGreaterThan(9);
      expect(tokens).toBeLessThan(12);
    });

    test('should count Japanese Hiragana and Katakana', () => {
      const japanese = 'こんにちは カタカナ';
      // ~10 chars, mostly CJK * 1.3 ≈ 13 tokens
      const tokens = countTokens(japanese);
      expect(tokens).toBeGreaterThan(11);
      expect(tokens).toBeLessThan(15);
    });

    test('should count mixed CJK and English', () => {
      const mixed = 'Hello 안녕하세요 World';
      // "Hello " = 6 chars / 4 = 1.5
      // "안녕하세요" = 5 chars * 1.3 = 6.5
      // " World" = 6 chars / 4 = 1.5
      // Total ≈ 9.5 tokens
      const tokens = countTokens(mixed);
      expect(tokens).toBeGreaterThan(8);
      expect(tokens).toBeLessThan(12);
    });
  });

  describe('mixed content', () => {
    test('should handle code with Korean comments', () => {
      const code = `// 사용자 정보를 가져오는 함수
function getUser(id: number) {
  return { id, name: "홍길동" };
}`;
      // Should be detected as MIXED and use weighted average
      const tokens = countTokens(code);
      expect(tokens).toBeGreaterThan(25);
      expect(tokens).toBeLessThan(45);
    });

    test('should handle markdown with code blocks', () => {
      const markdown = `# Title
This is a paragraph.

\`\`\`typescript
const x = 42;
\`\`\``;
      const tokens = countTokens(markdown);
      expect(tokens).toBeGreaterThanOrEqual(14);
      expect(tokens).toBeLessThan(30);
    });

    test('should handle mixed natural language and code', () => {
      const mixed = 'To calculate sum, use: const sum = (a, b) => a + b;';
      const tokens = countTokens(mixed);
      expect(tokens).toBeGreaterThan(12);
      expect(tokens).toBeLessThan(25);
    });
  });

  describe('accuracy improvements', () => {
    test('should provide better estimates for code than simple char/4', () => {
      const code = 'const users = data.filter(u => u.active).map(u => u.name);';
      const simpleEstimate = Math.round(code.length / 4); // ~15 tokens
      const improvedEstimate = countTokens(code); // Should be ~24 tokens

      // Improved estimate should be significantly higher for code
      expect(improvedEstimate).toBeGreaterThan(simpleEstimate * 1.3);
    });

    test('should provide better estimates for CJK than simple char/4', () => {
      const cjk = '이것은 토큰 카운팅 테스트입니다';
      const simpleEstimate = Math.round(cjk.length / 4); // ~4 tokens
      const improvedEstimate = countTokens(cjk); // Should be ~20 tokens

      // CJK should have much higher token count
      expect(improvedEstimate).toBeGreaterThan(simpleEstimate * 3);
    });
  });

  describe('edge cases', () => {
    test('should handle strings with only punctuation', () => {
      const punctuation = '!!!...???;;;';
      const tokens = countTokens(punctuation);
      expect(tokens).toBeGreaterThanOrEqual(0);
      expect(tokens).toBeLessThan(20);
    });

    test('should handle strings with only whitespace', () => {
      const whitespace = '   \n\n\t\t  ';
      const tokens = countTokens(whitespace);
      expect(tokens).toBeGreaterThanOrEqual(0);
      expect(tokens).toBeLessThan(5);
    });

    test('should handle very long code strings', () => {
      const longCode = 'const x = 1;\n'.repeat(100);
      const tokens = countTokens(longCode);
      expect(tokens).toBeGreaterThan(400); // Should detect as code
      expect(tokens).toBeLessThan(600);
    });

    test('should handle emoji and special unicode', () => {
      const emoji = '🚀 Hello World! 👋';
      const tokens = countTokens(emoji);
      expect(tokens).toBeGreaterThan(3);
      expect(tokens).toBeLessThan(10);
    });
  });
});
