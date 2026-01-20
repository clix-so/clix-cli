import { homedir } from 'node:os';

/**
 * Formats a file path by replacing the home directory with ~
 * @param path - The absolute path to format
 * @returns The formatted path with ~ for home directory
 */
export function formatPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, '~');
  }
  return path;
}
