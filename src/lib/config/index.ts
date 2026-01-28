/**
 * Configuration system with Zod schema validation and migration support.
 *
 * @module config
 */

export { ConfigManager, getConfigManager, resetConfigManager } from './manager';
export {
  type AgentConfig,
  AgentConfigSchema,
  type Config,
  ConfigSchema,
  type ConfigUpdate,
  DEFAULT_CONFIG,
  DEFAULT_EXPERIMENTAL_CONFIG,
  DEFAULT_UI_CONFIG,
  type DeepPartial,
  type ExperimentalConfig,
  ExperimentalSchema,
  type LinkedProject,
  LinkedProjectSchema,
  PartialConfigSchema,
  safeValidateConfig,
  type UIConfig,
  UIConfigSchema,
  validateConfig,
  validatePartialConfig,
  type WorkspaceMappings,
  WorkspaceMappingsSchema,
} from './schema';
