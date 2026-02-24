import { describe, expect, test } from 'bun:test';
import { isItalicMatch } from '../InlineMarkdownRenderer';

describe('isItalicMatch', () => {
  test('does not treat underscore tokens as italic markdown', () => {
    const text = 'value_with_underscore';
    expect(isItalicMatch('_with_', text, 5, 11)).toBe(false);
  });

  test('treats standalone asterisk markdown as italic', () => {
    const text = ' *hello* ';
    expect(isItalicMatch('*hello*', text, 1, 8)).toBe(true);
  });

  test('does not treat path-like tokens as italic', () => {
    const text = '/tmp/*file*/path';
    expect(isItalicMatch('*file*', text, 5, 11)).toBe(false);
  });
});
