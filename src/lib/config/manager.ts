import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError, ERROR_CODES } from '../errors/types';
import { coreEvents } from '../events/core-events';
import { xdg } from '../utils/xdg';
import {
  type Config,
  ConfigSchema,
  type ConfigUpdate,
  DEFAULT_CONFIG,
  DEFAULT_EXPERIMENTAL_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_UPDATE_CONFIG,
  safeValidateConfig,
} from './schema';

/**
 * Current configuration schema version.
 * Increment when making breaking changes to config structure.
 */
const CURRENT_VERSION = 3;

/**
 * Migration function type.
 */
type MigrationFn = (config: Record<string, unknown>) => Record<string, unknown>;

/**
 * Raw config type for migrations (allows arbitrary properties).
 */
type RawConfig = Record<string, unknown>;

/**
 * Migration registry indexed by target version.
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  // Migration from v1 to v2: Convert selectedCLI to selectedAgent
  2: (config: RawConfig): RawConfig => {
    const migrated: RawConfig = { ...config, version: 2 };

    // Migrate old selectedCLI field
    if ('selectedCLI' in config && !('selectedAgent' in config)) {
      migrated.selectedAgent = config.selectedCLI;
      migrated.selectedCLI = undefined;
    }

    // Ensure selectedAgent exists
    if (!('selectedAgent' in migrated)) {
      migrated.selectedAgent = '';
    }

    // Ensure default structures exist with full defaults
    if (!migrated.ui || typeof migrated.ui !== 'object') {
      migrated.ui = { ...DEFAULT_UI_CONFIG };
    }
    if (!migrated.agents) {
      migrated.agents = {};
    }
    if (!migrated.experimental || typeof migrated.experimental !== 'object') {
      migrated.experimental = { ...DEFAULT_EXPERIMENTAL_CONFIG };
    }

    return migrated;
  },

  // Migration from v2 to v3: Add update configuration
  3: (config: RawConfig): RawConfig => {
    const migrated: RawConfig = { ...config, version: 3 };

    // Ensure update config exists with defaults
    if (!migrated.update || typeof migrated.update !== 'object') {
      migrated.update = { ...DEFAULT_UPDATE_CONFIG };
    }

    return migrated;
  },
};

/**
 * ConfigManager handles loading, saving, and migrating configuration.
 * Uses Zod schemas for validation and supports version migrations.
 *
 * @example
 * ```typescript
 * const config = await configManager.load();
 * console.log(config.selectedAgent);
 *
 * await configManager.save({ selectedAgent: 'claude' });
 * ```
 */
export class ConfigManager {
  private cachedConfig: Config | null = null;
  private configDirPath: string;
  private configFilePath: string;

  constructor(customConfigDir?: string) {
    this.configDirPath = customConfigDir ?? xdg.config();
    this.configFilePath = join(this.configDirPath, 'config.json');
  }

  /**
   * Get the configuration directory path.
   */
  get configDir(): string {
    return this.configDirPath;
  }

  /**
   * Get the configuration file path.
   */
  get configPath(): string {
    return this.configFilePath;
  }

  /**
   * Ensure the config directory exists.
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await stat(this.configDirPath);
    } catch {
      await mkdir(this.configDirPath, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Get the config file path, ensuring directory exists.
   */
  async getConfigPath(): Promise<string> {
    await this.ensureConfigDir();
    return this.configFilePath;
  }

  /**
   * Load configuration from disk.
   * Validates against schema and migrates if needed.
   * Returns cached config if available.
   *
   * @returns Validated configuration
   */
  async load(): Promise<Config> {
    // Return cached config if available
    if (this.cachedConfig !== null) {
      return this.cachedConfig;
    }

    try {
      const path = await this.getConfigPath();
      const content = await readFile(path, 'utf-8');
      const rawConfig = JSON.parse(content);

      // Migrate if needed
      const migratedConfig = this.migrate(rawConfig);

      // Validate with Zod schema
      const validatedConfig = safeValidateConfig(migratedConfig);

      if (!validatedConfig) {
        // Log warning and return defaults
        coreEvents.emit('config:changed', {
          key: 'validation',
          oldValue: rawConfig,
          newValue: DEFAULT_CONFIG,
        });
        this.cachedConfig = { ...DEFAULT_CONFIG };
        return this.cachedConfig;
      }

      // Merge with defaults to ensure all fields are present
      const completeConfig = this.mergeWithDefaults(validatedConfig);

      // Save migrated config if version changed
      if (rawConfig.version !== completeConfig.version) {
        await this.saveRaw(completeConfig);
      }

      this.cachedConfig = completeConfig;
      return completeConfig;
    } catch (error) {
      // File doesn't exist or is invalid - return defaults
      if (error instanceof SyntaxError) {
        throw new ConfigError(
          'Invalid JSON in configuration file',
          ERROR_CODES.CONFIG_INVALID,
          this.configFilePath,
        );
      }

      this.cachedConfig = { ...DEFAULT_CONFIG };
      return this.cachedConfig;
    }
  }

  /**
   * Merge a partial config with defaults to ensure all fields are present.
   */
  private mergeWithDefaults(config: Config): Config {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...config.ui,
      },
      experimental: {
        ...DEFAULT_CONFIG.experimental,
        ...config.experimental,
      },
      update: {
        ...DEFAULT_CONFIG.update,
        ...config.update,
      },
      agents: config.agents ?? {},
    };
  }

  /**
   * Save configuration updates.
   * Merges with existing config and validates before saving.
   *
   * @param updates - Partial config updates to merge (supports deep partial)
   */
  async save(updates: ConfigUpdate): Promise<void> {
    const current = this.cachedConfig ?? (await this.load());

    // Deep merge updates
    const merged = this.mergeConfig(current, updates);

    // Validate the merged config
    const result = ConfigSchema.safeParse(merged);
    if (!result.success) {
      throw new ConfigError(
        `Invalid configuration update: ${result.error.message}`,
        ERROR_CODES.CONFIG_INVALID,
      );
    }

    // Emit change events for each updated key
    for (const key of Object.keys(updates) as (keyof ConfigUpdate)[]) {
      if (current[key as keyof Config] !== updates[key]) {
        coreEvents.emit('config:changed', {
          key: key as string,
          oldValue: current[key as keyof Config],
          newValue: updates[key],
        });
      }
    }

    await this.saveRaw(result.data);
    this.cachedConfig = result.data;
  }

  /**
   * Save raw config without merging.
   */
  private async saveRaw(config: Config): Promise<void> {
    const path = await this.getConfigPath();
    await writeFile(path, JSON.stringify(config, null, 2));
  }

  /**
   * Deep merge configuration objects.
   */
  private mergeConfig(base: Config, updates: ConfigUpdate): Config {
    const merged = { ...base };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Deep merge objects
          const baseValue = merged[key as keyof Config];
          if (typeof baseValue === 'object' && baseValue !== null) {
            (merged as Record<string, unknown>)[key] = {
              ...baseValue,
              ...value,
            };
          } else {
            (merged as Record<string, unknown>)[key] = value;
          }
        } else {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Migrate configuration to current version.
   * Applies sequential migrations from old version to current.
   *
   * @param config - Raw configuration object
   * @returns Migrated configuration
   */
  private migrate(config: Record<string, unknown>): Record<string, unknown> {
    let currentConfig = { ...config };
    const startVersion = typeof config.version === 'number' ? config.version : 1;

    // Apply migrations sequentially
    for (let version = startVersion + 1; version <= CURRENT_VERSION; version++) {
      const migration = MIGRATIONS[version];
      if (migration) {
        try {
          currentConfig = migration(currentConfig);
        } catch {
          throw new ConfigError(
            `Migration to version ${version} failed`,
            ERROR_CODES.CONFIG_MIGRATION_FAILED,
          );
        }
      }
    }

    return currentConfig;
  }

  /**
   * Get a specific config value.
   *
   * @param key - Configuration key
   * @returns The configuration value
   */
  async get<K extends keyof Config>(key: K): Promise<Config[K]> {
    const config = this.cachedConfig ?? (await this.load());
    return config[key];
  }

  /**
   * Set a specific config value.
   *
   * @param key - Configuration key
   * @param value - New value
   */
  async set<K extends keyof Config>(key: K, value: Config[K]): Promise<void> {
    await this.save({ [key]: value } as Partial<Config>);
  }

  /**
   * Reset configuration to defaults.
   */
  async reset(): Promise<void> {
    await this.saveRaw(DEFAULT_CONFIG);
    this.cachedConfig = DEFAULT_CONFIG;
    coreEvents.emit('config:changed', {
      key: 'all',
      oldValue: this.cachedConfig,
      newValue: DEFAULT_CONFIG,
    });
  }

  /**
   * Clear the cached config (useful for testing).
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

/**
 * Singleton instance for the default config manager.
 */
let defaultManager: ConfigManager | null = null;

/**
 * Get the default ConfigManager instance.
 */
export function getConfigManager(): ConfigManager {
  if (!defaultManager) {
    defaultManager = new ConfigManager();
  }
  return defaultManager;
}

/**
 * Reset the default ConfigManager instance (useful for testing).
 */
export function resetConfigManager(): void {
  defaultManager = null;
}
