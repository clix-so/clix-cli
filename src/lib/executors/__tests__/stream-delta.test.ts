import { describe, expect, test } from 'bun:test';
import { extractCumulativeDelta } from '../stream-delta';

describe('extractCumulativeDelta', () => {
  test('returns full text for first snapshot', () => {
    expect(extractCumulativeDelta('', 'Hello')).toBe('Hello');
  });

  test('returns appended suffix for prefix snapshots', () => {
    expect(extractCumulativeDelta('Hello', 'Hello world')).toBe(' world');
  });

  test('returns suffix after suffix-prefix overlap', () => {
    expect(extractCumulativeDelta('abc123', '123xyz')).toBe('xyz');
  });

  test('returns empty string for rewind snapshots already contained in previous', () => {
    expect(extractCumulativeDelta('Hello world', 'Hello')).toBe('');
  });

  test('returns a newline-prefixed block for full rewrites', () => {
    expect(extractCumulativeDelta('Hello world', 'Rewritten output')).toBe('\nRewritten output');
  });
});
