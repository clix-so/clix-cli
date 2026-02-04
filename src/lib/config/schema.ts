import { z } from 'zod';

/**
 * Schema for UI configuration options.
 */
export const UIConfigSchema = z.object({
  /** Enable streaming output display */
  streaming: z.boolean(),
  /** Show timestamps in messages */
  showTimestamps: z.boolean(),
  /** Theme preference */
  theme: z.enum(['auto', 'dark', 'light']),
  /** Compact mode for smaller terminals */
  compactMode: z.boolean(),
});

/**
 * Schema for agent-specific configuration.
 */
export const AgentConfigSchema = z.object({
  /** Custom model override */
  model: z.string().optional(),
  /** API endpoint override */
  endpoint: z.string().url().optional(),
  /** Additional environment variables */
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Schema for experimental features.
 */
export const ExperimentalSchema = z.object({
  /** Enable debug logging */
  debug: z.boolean(),
  /** Enable verbose output */
  verbose: z.boolean(),
  /** Custom features flags */
  features: z.record(z.string(), z.boolean()).optional(),
});

/**
 * Schema for update configuration.
 */
export const UpdateConfigSchema = z.object({
  /** Disable automatic update checks on startup */
  disableAutoCheck: z.boolean(),
  /** Disable update notifications */
  disableUpdateNag: z.boolean(),
  /** ISO timestamp of last update check */
  lastCheckTime: z.string().datetime().optional(),
  /** Last known available version */
  lastKnownVersion: z.string().optional(),
});

/**
 * Main configuration schema with versioning for migrations.
 * Validation-only schema - does not enforce defaults.
 */
export const ConfigSchema = z.object({
  /** Configuration schema version for migrations */
  version: z.number().int().min(1),
  /** Currently selected agent identifier */
  selectedAgent: z.string(),
  /** ISO timestamp of last usage */
  lastUsedAt: z.string().datetime().optional(),
  /** UI configuration */
  ui: UIConfigSchema,
  /** Per-agent configuration overrides */
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  /** Experimental features */
  experimental: ExperimentalSchema,
  /** Update configuration */
  update: UpdateConfigSchema,
});

/**
 * Partial config schema for validation of updates.
 */
export const PartialConfigSchema = ConfigSchema.partial();

/**
 * Type definitions derived from schemas.
 */
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ExperimentalConfig = z.infer<typeof ExperimentalSchema>;
export type UpdateConfig = z.infer<typeof UpdateConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Deep partial type for nested config updates.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Partial config type that allows partial nested objects.
 */
export type ConfigUpdate = DeepPartial<Config>;

/**
 * Default UI configuration values.
 */
export const DEFAULT_UI_CONFIG: UIConfig = {
  streaming: true,
  showTimestamps: false,
  theme: 'auto',
  compactMode: false,
};

/**
 * Default experimental configuration values.
 */
export const DEFAULT_EXPERIMENTAL_CONFIG: ExperimentalConfig = {
  debug: false,
  verbose: false,
  features: {},
};

/**
 * Default update configuration values.
 */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  disableAutoCheck: false,
  disableUpdateNag: false,
  lastCheckTime: undefined,
  lastKnownVersion: undefined,
};

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Config = {
  version: 5,
  selectedAgent: '',
  lastUsedAt: undefined,
  ui: DEFAULT_UI_CONFIG,
  agents: {},
  experimental: DEFAULT_EXPERIMENTAL_CONFIG,
  update: DEFAULT_UPDATE_CONFIG,
};

/**
 * Validate a config object against the schema.
 *
 * @param data - Configuration data to validate
 * @returns Validated Config
 * @throws ZodError if validation fails
 */
export function validateConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

/**
 * Safely validate config without throwing.
 * Returns null if validation fails.
 *
 * @param data - Data to validate
 * @returns Config if valid, null otherwise
 */
export function safeValidateConfig(data: unknown): Config | null {
  const result = ConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate partial config updates.
 *
 * @param data - Partial update data
 * @returns Validated partial config
 */
export function validatePartialConfig(data: unknown): Partial<Config> {
  return PartialConfigSchema.parse(data);
}
