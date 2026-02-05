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
 * Main project configuration schema.
 * Stored in .clix/config.jsonc in the project root.
 */
export const ProjectConfigSchema = z.object({
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
 * Type definitions derived from schemas.
 */
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;
export type ProjectOrganization = z.infer<typeof ProjectOrganizationSchema>;
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Current project config version.
 */
export const CURRENT_PROJECT_CONFIG_VERSION = 1;

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
