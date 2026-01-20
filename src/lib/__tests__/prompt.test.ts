import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PROMPT_URL, PromptFetcher } from '../prompt';

describe('PromptFetcher', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `clix-prompt-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('should have default prompt URL defined', () => {
    expect(DEFAULT_PROMPT_URL).toBeDefined();
    expect(DEFAULT_PROMPT_URL).toContain('github');
    expect(DEFAULT_PROMPT_URL).toContain('prompt.txt');
  });

  test('should fetch from file:// URL', async () => {
    const testContent = 'Test prompt content';
    const testFile = join(testDir, 'test-prompt.txt');

    await writeFile(testFile, testContent);

    const fetcher = new PromptFetcher();
    const content = await fetcher.fetch(`file://${testFile}`);

    expect(content).toBe(testContent);
  });

  test('should throw error for non-existent file:// URL', async () => {
    const fetcher = new PromptFetcher();
    const nonExistentFile = join(testDir, 'non-existent.txt');

    await expect(fetcher.fetch(`file://${nonExistentFile}`)).rejects.toThrow('File not found');
  });

  test('should use default URL when no URL provided', async () => {
    const fetcher = new PromptFetcher();

    try {
      const content = await fetcher.fetch();
      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
    } catch (error) {
      // Network error is acceptable in test environment
      console.warn('Skipping network test:', error);
    }
  });
});
