import { homedir } from 'node:os';

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
