import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse } from 'node:path';

/**
 * Project root markers in order of priority.
 */
const PROJECT_MARKERS = [
  '.clix', // Clix config directory (highest priority - already initialized)
  'package.json', // Node.js project
  '.git', // Git repository
  'Podfile', // iOS project
  'Package.swift', // Swift package
  'pubspec.yaml', // Flutter project
  'build.gradle', // Android/Gradle project
];

/**
 * Find the project root by walking up directories looking for project markers.
 *
 * @param startDir - Starting directory (defaults to process.cwd())
 * @returns Project root path, or the starting directory if no markers found
 */
export function findProjectRoot(startDir?: string): string {
  let currentDir = startDir ?? process.cwd();
  const { root } = parse(currentDir);

  while (currentDir !== root) {
    // Check for any project markers
    for (const marker of PROJECT_MARKERS) {
      const markerPath = join(currentDir, marker);
      if (existsSync(markerPath)) {
        return currentDir;
      }
    }
    // Move up one directory
    currentDir = dirname(currentDir);
  }

  // No markers found, return the original starting directory
  return startDir ?? process.cwd();
}

/**
 * Formats a file path by replacing the home directory with ~
 * @param path - The absolute path to format
 * @returns The formatted path with ~ for home directory
 */
export function formatPath(path: string): string {
  const home = homedir();
  // Exact match: home directory itself
  if (path === home) {
    return '~';
  }
  // Path under home directory (must have separator after home)
  if (path.startsWith(`${home}/`)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}
