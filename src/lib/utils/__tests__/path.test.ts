import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { formatPath } from '../path';

describe('formatPath', () => {
  const home = homedir();

  test('should replace home directory with ~', () => {
    const inputPath = `${home}/projects/my-app`;
    const result = formatPath(inputPath);
    expect(result).toBe('~/projects/my-app');
  });

  test('should handle home directory itself', () => {
    const result = formatPath(home);
    expect(result).toBe('~');
  });

  test('should handle nested paths within home directory', () => {
    const inputPath = `${home}/.config/clix/config.json`;
    const result = formatPath(inputPath);
    expect(result).toBe('~/.config/clix/config.json');
  });

  test('should not modify paths outside home directory', () => {
    const inputPath = '/usr/local/bin/app';
    const result = formatPath(inputPath);
    expect(result).toBe('/usr/local/bin/app');
  });

  test('should not modify relative paths', () => {
    const inputPath = './src/lib/utils';
    const result = formatPath(inputPath);
    expect(result).toBe('./src/lib/utils');
  });

  test('should not modify paths that contain home directory as substring', () => {
    // A path that contains the home path as a substring but doesn't start with it
    const inputPath = `/not${home}/some/path`;
    const result = formatPath(inputPath);
    expect(result).toBe(`/not${home}/some/path`);
  });

  test('should handle empty string', () => {
    const result = formatPath('');
    expect(result).toBe('');
  });

  test('should handle root path', () => {
    const result = formatPath('/');
    expect(result).toBe('/');
  });
});
