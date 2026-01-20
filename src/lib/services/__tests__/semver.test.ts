import { describe, expect, test } from 'bun:test';
import { compare, eq, gt, gte, lt, lte, valid } from '../semver';

describe('semver/valid', () => {
  test('should return version for valid semver string', () => {
    expect(valid('1.2.3')).toBe('1.2.3');
  });

  test('should return version for semver with v prefix', () => {
    expect(valid('v1.2.3')).toBe('v1.2.3');
  });

  test('should return version for semver with prerelease', () => {
    expect(valid('1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });

  test('should return null for invalid semver', () => {
    expect(valid('invalid')).toBeNull();
    expect(valid('1.2')).toBeNull();
    expect(valid('1')).toBeNull();
    expect(valid('')).toBeNull();
  });
});

describe('semver/compare', () => {
  test('should return 1 when a > b (major)', () => {
    expect(compare('2.0.0', '1.0.0')).toBe(1);
  });

  test('should return 1 when a > b (minor)', () => {
    expect(compare('1.2.0', '1.1.0')).toBe(1);
  });

  test('should return 1 when a > b (patch)', () => {
    expect(compare('1.0.2', '1.0.1')).toBe(1);
  });

  test('should return -1 when a < b', () => {
    expect(compare('1.0.0', '2.0.0')).toBe(-1);
  });

  test('should return 0 when a === b', () => {
    expect(compare('1.2.3', '1.2.3')).toBe(0);
  });

  test('should handle v prefix', () => {
    expect(compare('v2.0.0', '1.0.0')).toBe(1);
    expect(compare('1.0.0', 'v2.0.0')).toBe(-1);
  });

  test('should return 0 for invalid versions', () => {
    expect(compare('invalid', '1.0.0')).toBe(0);
    expect(compare('1.0.0', 'invalid')).toBe(0);
  });
});

describe('semver/gt', () => {
  test('should return true when a > b', () => {
    expect(gt('2.0.0', '1.0.0')).toBe(true);
    expect(gt('1.1.0', '1.0.0')).toBe(true);
    expect(gt('1.0.1', '1.0.0')).toBe(true);
  });

  test('should return false when a <= b', () => {
    expect(gt('1.0.0', '2.0.0')).toBe(false);
    expect(gt('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('semver/lt', () => {
  test('should return true when a < b', () => {
    expect(lt('1.0.0', '2.0.0')).toBe(true);
  });

  test('should return false when a >= b', () => {
    expect(lt('2.0.0', '1.0.0')).toBe(false);
    expect(lt('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('semver/eq', () => {
  test('should return true when a === b', () => {
    expect(eq('1.0.0', '1.0.0')).toBe(true);
    expect(eq('v1.0.0', '1.0.0')).toBe(true);
  });

  test('should return false when a !== b', () => {
    expect(eq('1.0.0', '2.0.0')).toBe(false);
  });
});

describe('semver/gte', () => {
  test('should return true when a >= b', () => {
    expect(gte('2.0.0', '1.0.0')).toBe(true);
    expect(gte('1.0.0', '1.0.0')).toBe(true);
  });

  test('should return false when a < b', () => {
    expect(gte('1.0.0', '2.0.0')).toBe(false);
  });
});

describe('semver/lte', () => {
  test('should return true when a <= b', () => {
    expect(lte('1.0.0', '2.0.0')).toBe(true);
    expect(lte('1.0.0', '1.0.0')).toBe(true);
  });

  test('should return false when a > b', () => {
    expect(lte('2.0.0', '1.0.0')).toBe(false);
  });
});
