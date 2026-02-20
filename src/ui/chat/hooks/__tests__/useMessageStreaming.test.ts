import { describe, expect, test } from 'bun:test';
import { mergeStreamText } from '../useMessageStreaming';

describe('mergeStreamText', () => {
  test('appends chunks by default', () => {
    expect(mergeStreamText('hello', ' world')).toBe('hello world');
  });

  test('replaces full content when stream mode is replace', () => {
    expect(mergeStreamText('hello world', 'rewritten', 'replace')).toBe('rewritten');
  });
});
