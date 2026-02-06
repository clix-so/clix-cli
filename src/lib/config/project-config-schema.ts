import { z } from 'zod';

/**
 * Project framework types.
 */
export type ProjectFramework = 'native' | 'react-native' | 'expo' | 'flutter' | 'unknown';

/**
 * Target platform types.
 */
export type ProjectTargetPlatform = 'ios' | 'android' | 'ios-android' | 'unknown';

/**
 * Schema for project type (framework + target platform).
 */
export const ProjectTypeSchema = z.object({
  /** Framework used (native, react-native, expo, flutter, unknown) */
  framework: z.enum(['native', 'react-native', 'expo', 'flutter', 'unknown']),
  /** Target platform (ios, android, ios-android, unknown) */
  target: z.enum(['ios', 'android', 'ios-android', 'unknown']),
});

export type ProjectType = z.infer<typeof ProjectTypeSchema>;

/**
 * Schema for member information in project config.
 */
export const ProjectMemberSchema = z.object({
  /** Member ID */
  id: z.string(),
  /** Member email */
  email: z.string().email(),
  /** Member display name */
  name: z.string(),
});

/**
 * Schema for organization information in project config.
 */
export const ProjectOrganizationSchema = z.object({
  /** Organization ID */
  id: z.string(),
  /** Organization name */
  name: z.string(),
});

/**
 * Schema for project information in project config.
 */
export const ProjectInfoSchema = z.object({
  /** Project ID */
  id: z.string(),
  /** Project name */
  name: z.string(),
  /** Project public key (for SDK integration) */
  publicKey: z.string().optional(),
});

/**
 * Schema for iOS setup status.
 */
export const IosSetupSchema = z.object({
  /** iOS Bundle ID */
  bundleId: z.string().optional(),
  /** Apple Team ID */
  teamId: z.string().optional(),
  /** App Group ID for sharing data between app and extensions */
  appGroupId: z.string().optional(),
  /** Whether entitlements have been configured */
  entitlementsConfigured: z.boolean(),
  /** Whether Notification Service Extension has been configured */
  nseConfigured: z.boolean(),
  /** ISO timestamp when iOS setup was completed */
  completedAt: z.string().datetime().optional(),
});

/**
 * Schema for Firebase setup status.
 */
export const FirebaseSetupSchema = z.object({
  /** Firebase project ID */
  projectId: z.string().optional(),
  /** Whether Android config (google-services.json) is configured */
  androidConfigured: z.boolean(),
  /** Whether iOS config (GoogleService-Info.plist) is configured */
  iosConfigured: z.boolean(),
  /** ISO timestamp when Firebase setup was completed */
  completedAt: z.string().datetime().optional(),
});

/**
 * Schema for APNS setup status.
 */
export const ApnsSetupSchema = z.object({
  /** APNS Key ID */
  keyId: z.string().optional(),
  /** Apple Team ID for APNS */
  teamId: z.string().optional(),
  /** Whether APNS key has been registered with Firebase */
  registeredWithFirebase: z.boolean(),
  /** ISO timestamp when APNS setup was completed */
  completedAt: z.string().datetime().optional(),
});

/**
 * Schema for setup status tracking.
 */
export const SetupStatusSchema = z.object({
  /** iOS setup status */
  ios: IosSetupSchema.optional(),
  /** Firebase setup status */
  firebase: FirebaseSetupSchema.optional(),
  /** APNS setup status */
  apns: ApnsSetupSchema.optional(),
});

/**
 * Main project configuration schema (version 1 - legacy).
 * Stored in .clix/config.jsonc in the project root.
 */
export const ProjectConfigV1Schema = z.object({
  /** Configuration schema version */
  version: z.literal(1),
  /** Logged-in member information */
  member: ProjectMemberSchema,
  /** Selected organization */
  organization: ProjectOrganizationSchema,
  /** Selected project */
  project: ProjectInfoSchema,
  /** Detected project type (framework + target platform) */
  projectType: ProjectTypeSchema.optional(),
  /** ISO timestamp when this config was created/linked */
  linkedAt: z.string().datetime(),
});

/**
 * Main project configuration schema (version 2 - current).
 * Stored in .clix/config.jsonc in the project root.
 */
export const ProjectConfigV2Schema = z.object({
  /** Configuration schema version */
  version: z.literal(2),
  /** Logged-in member information */
  member: ProjectMemberSchema,
  /** Selected organization */
  organization: ProjectOrganizationSchema,
  /** Selected project */
  project: ProjectInfoSchema,
  /** Detected project type (framework + target platform) */
  projectType: ProjectTypeSchema.optional(),
  /** ISO timestamp when this config was created/linked */
  linkedAt: z.string().datetime(),
  /** Setup status tracking for install preparation */
  setup: SetupStatusSchema.optional(),
});

/**
 * Union schema that accepts both v1 and v2 configs.
 */
export const ProjectConfigSchema = z.union([ProjectConfigV1Schema, ProjectConfigV2Schema]);

/**
 * Type definitions derived from schemas.
 */
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;
export type ProjectOrganization = z.infer<typeof ProjectOrganizationSchema>;
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
export type IosSetup = z.infer<typeof IosSetupSchema>;
export type FirebaseSetup = z.infer<typeof FirebaseSetupSchema>;
export type ApnsSetup = z.infer<typeof ApnsSetupSchema>;
export type SetupStatus = z.infer<typeof SetupStatusSchema>;
export type ProjectConfigV1 = z.infer<typeof ProjectConfigV1Schema>;
export type ProjectConfigV2 = z.infer<typeof ProjectConfigV2Schema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Current project config version.
 */
export const CURRENT_PROJECT_CONFIG_VERSION = 2;

/**
 * Project config file name.
 */
export const PROJECT_CONFIG_FILENAME = 'config.jsonc';

/**
 * Project config directory name.
 */
export const PROJECT_CONFIG_DIR = '.clix';

/**
 * Validate a project config object against the schema.
 *
 * @param data - Configuration data to validate
 * @returns Validated ProjectConfig
 * @throws ZodError if validation fails
 */
export function validateProjectConfig(data: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(data);
}

/**
 * Safely validate project config without throwing.
 * Returns null if validation fails.
 *
 * @param data - Data to validate
 * @returns ProjectConfig if valid, null otherwise
 */
export function safeValidateProjectConfig(data: unknown): ProjectConfig | null {
  const result = ProjectConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Check if config is version 1.
 */
export function isConfigV1(config: ProjectConfig): config is ProjectConfigV1 {
  return config.version === 1;
}

/**
 * Check if config is version 2.
 */
export function isConfigV2(config: ProjectConfig): config is ProjectConfigV2 {
  return config.version === 2;
}

/**
 * Migrate v1 config to v2.
 *
 * @param config - v1 config to migrate
 * @returns Migrated v2 config
 */
export function migrateV1ToV2(config: ProjectConfigV1): ProjectConfigV2 {
  return {
    ...config,
    version: 2,
    setup: undefined,
  };
}

/**
 * Ensure config is at the latest version (v2).
 * Migrates older versions if necessary.
 *
 * @param config - Config of any supported version
 * @returns Config at latest version (v2)
 */
export function ensureLatestVersion(config: ProjectConfig): ProjectConfigV2 {
  if (isConfigV2(config)) {
    return config;
  }
  return migrateV1ToV2(config);
}
