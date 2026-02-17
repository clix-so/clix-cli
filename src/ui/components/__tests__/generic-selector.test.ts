import { describe, expect, test } from 'bun:test';
import {
  formatDefaultSelectorLine,
  getSelectorLineWidth,
  type SelectorItem,
} from '../GenericSelector';

describe('GenericSelector line formatting', () => {
  test('pads short lines to fixed width to clear stale characters', () => {
    const item: SelectorItem = { id: 'cancel', label: 'Cancel' };
    const line = formatDefaultSelectorLine(item, {
      isSelected: true,
      isCurrent: false,
      width: 40,
    });

    expect(line.startsWith('› Cancel')).toBe(true);
    expect(line.length).toBe(40);
  });

  test('does not keep trailing text from previous longer labels', () => {
    const longItem: SelectorItem = {
      id: 'continue',
      label: 'Continue anyway (some setup missing)',
    };
    const shortItem: SelectorItem = { id: 'cancel', label: 'Cancel' };

    const previousLine = formatDefaultSelectorLine(longItem, {
      isSelected: true,
      isCurrent: false,
      width: 44,
    });
    const nextLine = formatDefaultSelectorLine(shortItem, {
      isSelected: true,
      isCurrent: false,
      width: 44,
    });

    expect(previousLine.includes('Continue anyway')).toBe(true);
    expect(nextLine.includes('Continue anyway')).toBe(false);
    expect(nextLine.includes('Cancelue')).toBe(false);
    expect(nextLine.length).toBe(44);
  });

  test('includes current marker and description in one stable line', () => {
    const item: SelectorItem = {
      id: 'alpha',
      label: 'Alpha',
      description: 'desc',
    };
    const line = formatDefaultSelectorLine(item, {
      isSelected: false,
      isCurrent: true,
      width: 32,
    });

    expect(line.includes('Alpha')).toBe(true);
    expect(line.includes('(current)')).toBe(true);
    expect(line.includes('desc')).toBe(true);
    expect(line.length).toBe(32);
  });
});

describe('getSelectorLineWidth', () => {
  test('uses terminal columns and subtracts selector chrome width', () => {
    expect(getSelectorLineWidth(120)).toBe(114);
  });

  test('uses fallback when columns is undefined', () => {
    expect(getSelectorLineWidth(undefined)).toBe(74);
  });

  test('enforces minimum width', () => {
    expect(getSelectorLineWidth(1)).toBe(10);
  });
});
