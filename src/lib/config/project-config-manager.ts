import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError, ERROR_CODES } from '../errors/types';
import {
  CURRENT_PROJECT_CONFIG_VERSION,
  ensureLatestVersion,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILENAME,
  type ProjectConfig,
  type SetupStatus,
  safeValidateProjectConfig,
} from './project-config-schema';

/**
 * Comment header for the project config file.
 */
const CONFIG_HEADER = '';

/**
 * Gitignore patterns to check for .clix directory.
 */
const GITIGNORE_PATTERNS = ['.clix', '.clix/', '/.clix', '/.clix/'];

/**
 * Gitignore entry to add.
 */
const GITIGNORE_ENTRY = '\n# Clix CLI local config\n.clix/\n';

/**
 * ProjectConfigManager handles loading and saving project-local configuration.
 * Configuration is stored in .clix/config.jsonc in the project root.
 *
 * @example
 * ```typescript
 * const manager = new ProjectConfigManager('/path/to/project');
 * const config = await manager.load();
 * if (config) {
 *   console.log(config.project.name);
 * }
 * ```
 */
export class ProjectConfigManager {
  private projectPath: string;
  private configDirPath: string;
  private configFilePath: string;
  private cachedConfig: ProjectConfig | null = null;

  constructor(projectPath?: string) {
    this.projectPath = projectPath ?? process.cwd();
    this.configDirPath = join(this.projectPath, PROJECT_CONFIG_DIR);
    this.configFilePath = join(this.configDirPath, PROJECT_CONFIG_FILENAME);
  }

  /**
   * Get the project root path.
   */
  get projectRoot(): string {
    return this.projectPath;
  }

  /**
   * Get the configuration directory path (.clix).
   */
  get configDir(): string {
    return this.configDirPath;
  }

  /**
   * Get the configuration file path (.clix/config.jsonc).
   */
  get configPath(): string {
    return this.configFilePath;
  }

  /**
   * Check if project config exists.
   *
   * @returns True if config file exists
   */
  async exists(): Promise<boolean> {
    try {
      await stat(this.configFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the .clix directory exists.
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await stat(this.configDirPath);
    } catch {
      await mkdir(this.configDirPath, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Load project configuration from disk.
   * Returns null if config doesn't exist.
   * Automatically migrates older versions to latest.
   *
   * @returns ProjectConfig or null if not found
   */
  async load(): Promise<ProjectConfig | null> {
    // Return cached config if available
    if (this.cachedConfig !== null) {
      return this.cachedConfig;
    }

    try {
      const content = await readFile(this.configFilePath, 'utf-8');

      // Strip JSONC comments for parsing
      const jsonContent = stripJsonComments(content);
      const rawConfig = JSON.parse(jsonContent);

      // Validate with Zod schema
      const validatedConfig = safeValidateProjectConfig(rawConfig);

      if (!validatedConfig) {
        throw new ConfigError(
          'Invalid project configuration',
          ERROR_CODES.PROJECT_CONFIG_INVALID,
          this.configFilePath,
        );
      }

      // Migrate to latest version if needed
      const migratedConfig = ensureLatestVersion(validatedConfig);
      const migratedConfigChanged =
        JSON.stringify(validatedConfig) !== JSON.stringify(migratedConfig);

      // Save migrated config if version changed
      if (validatedConfig.version !== CURRENT_PROJECT_CONFIG_VERSION || migratedConfigChanged) {
        await this.save(migratedConfig);
      }

      this.cachedConfig = migratedConfig;
      return migratedConfig;
    } catch (error) {
      // File doesn't exist - return null
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      // Re-throw config errors
      if (error instanceof ConfigError) {
        throw error;
      }

      // JSON parse error
      if (error instanceof SyntaxError) {
        throw new ConfigError(
          'Invalid JSON in project configuration file',
          ERROR_CODES.PROJECT_CONFIG_INVALID,
          this.configFilePath,
        );
      }

      throw error;
    }
  }

  /**
   * Update the setup status in config.
   * Creates setup object if it doesn't exist.
   *
   * @param updates - Partial setup status to merge
   */
  async updateSetup(updates: Partial<SetupStatus>): Promise<void> {
    const config = await this.load();
    if (!config) {
      throw new ConfigError(
        'Project config not found. Run "clix login" first.',
        ERROR_CODES.PROJECT_CONFIG_NOT_FOUND,
        this.configFilePath,
      );
    }

    const updatedConfig: ProjectConfig = {
      ...config,
      setup: {
        ...config.setup,
        ...updates,
      },
    };

    await this.save(updatedConfig);
  }

  /**
   * Save project configuration to disk.
   * Creates the .clix directory if it doesn't exist.
   *
   * @param config - Configuration to save
   */
  async save(config: ProjectConfig): Promise<void> {
    await this.ensureConfigDir();

    // Format as JSONC with header comment
    const jsonContent = JSON.stringify(config, null, 2);
    const content = `${CONFIG_HEADER}${jsonContent}\n`;

    await writeFile(this.configFilePath, content, 'utf-8');
    this.cachedConfig = config;
  }

  /**
   * Delete the project configuration.
   */
  async delete(): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(this.configFilePath);
      this.cachedConfig = null;
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Ensure .clix is in .gitignore.
   * Adds entry if not already present.
   *
   * @returns True if gitignore was modified
   */
  async ensureGitignore(): Promise<boolean> {
    const gitignorePath = join(this.projectPath, '.gitignore');

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

  /**
   * Clear the cached config (useful for testing).
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

interface CommentParserState {
  result: string;
  inString: boolean;
  inSingleLineComment: boolean;
  inMultiLineComment: boolean;
  index: number;
}

/** Check if current position is an unescaped quote */
function isUnescapedQuote(content: string, index: number): boolean {
  if (content[index] !== '"') {
    return false;
  }
  if (index === 0) {
    return true;
  }
  // Count consecutive backslashes before the quote
  // Even count (including 0) = unescaped quote, odd count = escaped quote
  let backslashCount = 0;
  let i = index - 1;
  while (i >= 0 && content[i] === '\\') {
    backslashCount++;
    i--;
  }
  return backslashCount % 2 === 0;
}

/** Process a character in string context */
function processStringChar(state: CommentParserState, char: string): void {
  state.result += char;
  state.index++;
}

/** Process comment start/end markers */
function processCommentMarkers(state: CommentParserState, char: string, nextChar: string): boolean {
  // Single-line comment start
  if (!state.inMultiLineComment && char === '/' && nextChar === '/') {
    state.inSingleLineComment = true;
    state.index += 2;
    return true;
  }
  // Single-line comment end
  if (state.inSingleLineComment && char === '\n') {
    state.inSingleLineComment = false;
    state.result += char;
    state.index++;
    return true;
  }
  // Multi-line comment start
  if (!state.inSingleLineComment && char === '/' && nextChar === '*') {
    state.inMultiLineComment = true;
    state.index += 2;
    return true;
  }
  // Multi-line comment end
  if (state.inMultiLineComment && char === '*' && nextChar === '/') {
    state.inMultiLineComment = false;
    state.index += 2;
    return true;
  }
  return false;
}

/**
 * Strip JSONC-style comments from a string.
 * Handles both single-line (//) and multi-line comments.
 *
 * @param content - JSONC content
 * @returns JSON content without comments
 */
function stripJsonComments(content: string): string {
  const state: CommentParserState = {
    result: '',
    inString: false,
    inSingleLineComment: false,
    inMultiLineComment: false,
    index: 0,
  };

  while (state.index < content.length) {
    const char = content[state.index];
    const nextChar = content[state.index + 1];

    // Handle string boundaries (outside comments)
    if (!state.inSingleLineComment && !state.inMultiLineComment) {
      if (isUnescapedQuote(content, state.index)) {
        state.inString = !state.inString;
        processStringChar(state, char);
        continue;
      }
    }

    // Inside a string, just copy
    if (state.inString) {
      processStringChar(state, char);
      continue;
    }

    // Handle comment markers
    if (processCommentMarkers(state, char, nextChar)) {
      continue;
    }

    // Copy non-comment characters
    if (!state.inSingleLineComment && !state.inMultiLineComment) {
      state.result += char;
    }
    state.index++;
  }

  return state.result;
}

/**
 * Get a ProjectConfigManager instance for the current working directory.
 *
 * @param projectPath - Optional project path (defaults to cwd)
 * @returns ProjectConfigManager instance
 */
export function getProjectConfigManager(projectPath?: string): ProjectConfigManager {
  return new ProjectConfigManager(projectPath);
}
