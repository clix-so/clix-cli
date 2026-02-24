import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Gitignore patterns to check for .clix directory.
 */
const GITIGNORE_PATTERNS = ['.clix', '.clix/', '/.clix', '/.clix/'];

/**
 * Gitignore entry to add.
 */
const GITIGNORE_ENTRY = '\n# Clix CLI local config\n.clix/\n';

/**
 * Ensure .clix is in .gitignore at the given project path.
 * Adds entry if not already present. Creates .gitignore if it doesn't exist.
 *
 * @param projectPath - The project root directory containing .gitignore
 * @returns True if gitignore was modified
 */
export async function ensureClixGitignore(projectPath: string): Promise<boolean> {
  const gitignorePath = join(projectPath, '.gitignore');

  try {
    let content = '';

    // Try to read existing .gitignore
    try {
      content = await readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist, will create new one
    }

    // Check if .clix is already ignored
    const lines = content.split('\n');
    const hasClixIgnore = lines.some((line) => {
      const trimmed = line.trim();
      return GITIGNORE_PATTERNS.includes(trimmed);
    });

    if (hasClixIgnore) {
      return false;
    }

    // Add .clix to gitignore
    const newContent =
      content.endsWith('\n') || content === ''
        ? `${content}${GITIGNORE_ENTRY}`
        : `${content}\n${GITIGNORE_ENTRY}`;

    await writeFile(gitignorePath, newContent, 'utf-8');
    return true;
  } catch {
    // Non-fatal: log warning but continue
    return false;
  }
}
