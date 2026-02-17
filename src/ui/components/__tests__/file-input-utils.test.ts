import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  normalizeInputFilePath,
  readTextFileFromInputPath,
  resolveInputFilePath,
} from '../file-input-utils';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (tempDir) => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }),
  );
  tempDirs.length = 0;
});

describe('file-input-utils', () => {
  test('normalizes quoted and escaped drag-and-drop paths', () => {
    const raw = '"/tmp/My\\ File.p8"';
    expect(normalizeInputFilePath(raw)).toBe('/tmp/My File.p8');
  });

  test('resolves relative paths to absolute paths', () => {
    const relative = './AuthKey_TEST123456.p8';
    expect(resolveInputFilePath(relative)).toBe(path.resolve(relative));
  });

  test('reads text file from drag-and-drop style input path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-input-utils-'));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, 'AuthKey_TEST123456.p8');
    await fs.writeFile(filePath, 'test-content', 'utf-8');

    const draggedPath = `"${filePath.replace(/ /g, '\\ ')}"`;
    const content = await readTextFileFromInputPath(draggedPath);
    expect(content).toBe('test-content');
  });
});
