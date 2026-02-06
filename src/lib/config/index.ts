/**
 * Configuration system with Zod schema validation and migration support.
 *
 * @module config
 */

export { ConfigManager, getConfigManager, resetConfigManager } from './manager';
// Project-local configuration
export { getProjectConfigManager, ProjectConfigManager } from './project-config-manager';
export {
  type ApnsSetup,
  ApnsSetupSchema,
  CURRENT_PROJECT_CONFIG_VERSION,
  ensureLatestVersion,
  type FirebaseSetup,
  FirebaseSetupSchema,
  type IosSetup,
  IosSetupSchema,
  isConfigV1,
  isConfigV2,
  migrateV1ToV2,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILENAME,
  type ProjectConfig,
  ProjectConfigSchema,
  type ProjectConfigV1,
  ProjectConfigV1Schema,
  type ProjectConfigV2,
  ProjectConfigV2Schema,
  type ProjectFramework,
  type ProjectInfo,
  ProjectInfoSchema,
  type ProjectMember,
  ProjectMemberSchema,
  type ProjectOrganization,
  ProjectOrganizationSchema,
  type ProjectTargetPlatform,
  type ProjectType,
  ProjectTypeSchema,
  type SetupStatus,
  SetupStatusSchema,
  safeValidateProjectConfig,
  validateProjectConfig,
} from './project-config-schema';
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
  PartialConfigSchema,
  safeValidateConfig,
  type UIConfig,
  UIConfigSchema,
  validateConfig,
  validatePartialConfig,
} from './schema';
