import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Normalize a file path entered in terminal input.
 *
 * - Trim whitespace
 * - Strip surrounding single/double quotes
 * - Unescape escaped spaces from drag-and-drop input (\ )
 */
export function normalizeInputFilePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  const withoutQuotes = trimmed.replace(/^['"]|['"]$/g, '');
  return withoutQuotes.replace(/\\ /g, ' ');
}

/**
 * Resolve input path to an absolute filesystem path.
 * Supports "~" home directory expansion.
 */
export function resolveInputFilePath(inputPath: string): string {
  const normalized = normalizeInputFilePath(inputPath);
  const expanded = normalized.startsWith('~')
    ? path.join(process.env.HOME || '', normalized.slice(1))
    : normalized;

  return path.resolve(expanded);
}

/**
 * Read UTF-8 file content from terminal input path.
 */
export async function readTextFileFromInputPath(inputPath: string): Promise<string> {
  const resolvedPath = resolveInputFilePath(inputPath);
  return fs.readFile(resolvedPath, 'utf-8');
}
