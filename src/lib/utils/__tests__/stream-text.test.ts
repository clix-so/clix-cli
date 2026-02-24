import { describe, expect, test } from 'bun:test';
import { normalizeStreamText } from '../stream-text';

describe('normalizeStreamText', () => {
  test('normalizes CRLF and CR to LF', () => {
    const input = 'line1\r\nline2\rline3\nline4';
    expect(normalizeStreamText(input)).toBe('line1\nline2\nline3\nline4');
  });

  test('removes control characters except tab and newline', () => {
    const input = `a\u0000b\u0007c\tok\nline\u001Fd`;
    expect(normalizeStreamText(input)).toBe('abc\tok\nlined');
  });
});
