/**
 * Zod schemas for Firebase credential file validation.
 *
 * @module services/firebase/schemas
 */

import { z } from 'zod';

/**
 * Schema for Android client info within google-services.json.
 */
const AndroidClientInfoSchema = z.object({
  package_name: z
    .string()
    .min(1, 'Package name is required')
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i, 'Invalid Android package name format'),
});

/**
 * Schema for client info within google-services.json.
 */
const ClientInfoSchema = z.object({
  mobilesdk_app_id: z
    .string()
    .min(1, 'Mobile SDK app ID is required')
    .regex(/^\d+:\d+:android:[a-f0-9]+$/, 'Invalid Mobile SDK app ID format'),
  android_client_info: AndroidClientInfoSchema,
});

/**
 * Schema for API key within google-services.json.
 */
const ApiKeySchema = z.object({
  current_key: z.string().min(1, 'API key is required'),
});

/**
 * Schema for OAuth client within google-services.json.
 */
const OAuthClientSchema = z.object({
  client_id: z.string().min(1),
  client_type: z.number(),
});

/**
 * Schema for services within google-services.json client.
 */
const ServicesSchema = z
  .object({
    appinvite_service: z
      .object({
        other_platform_oauth_client: z.array(OAuthClientSchema).optional(),
      })
      .optional(),
  })
  .optional();

/**
 * Schema for a client entry within google-services.json.
 */
const ClientSchema = z.object({
  client_info: ClientInfoSchema,
  api_key: z.array(ApiKeySchema).min(1, 'At least one API key is required'),
  oauth_client: z.array(OAuthClientSchema).optional(),
  services: ServicesSchema,
});

/**
 * Schema for project info within google-services.json.
 */
const ProjectInfoSchema = z.object({
  project_number: z.string().min(1, 'Project number is required'),
  project_id: z.string().min(1, 'Project ID is required'),
  storage_bucket: z.string(),
});

/**
 * Full schema for google-services.json (Android).
 * Validates the structure of Firebase configuration file for Android.
 */
export const GoogleServicesJsonSchema = z.object({
  project_info: ProjectInfoSchema,
  client: z.array(ClientSchema).min(1, 'At least one client configuration is required'),
  configuration_version: z.string().optional(),
});

/**
 * Schema for GoogleService-Info.plist (iOS).
 * Validates the structure of Firebase configuration file for iOS.
 */
export const GoogleServiceInfoPlistSchema = z.object({
  API_KEY: z.string().min(1, 'API_KEY is required'),
  GCM_SENDER_ID: z
    .string()
    .min(1, 'GCM_SENDER_ID is required')
    .regex(/^\d+$/, 'GCM_SENDER_ID must be numeric'),
  GOOGLE_APP_ID: z
    .string()
    .min(1, 'GOOGLE_APP_ID is required')
    .regex(/^\d+:\d+:ios:[a-f0-9]+$/, 'Invalid GOOGLE_APP_ID format'),
  PROJECT_ID: z.string().min(1, 'PROJECT_ID is required'),
  BUNDLE_ID: z
    .string()
    .min(1, 'BUNDLE_ID is required')
    .regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/i, 'Invalid bundle ID format'),
  CLIENT_ID: z.string().optional(),
  REVERSED_CLIENT_ID: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PLIST_VERSION: z.string().optional(),
  IS_ADS_ENABLED: z.boolean().optional(),
  IS_ANALYTICS_ENABLED: z.boolean().optional(),
  IS_APPINVITE_ENABLED: z.boolean().optional(),
  IS_GCM_ENABLED: z.boolean().optional(),
  IS_SIGNIN_ENABLED: z.boolean().optional(),
});

/**
 * Minimal schema for quick validation of google-services.json.
 * Used for initial detection before full validation.
 */
export const MinimalGoogleServicesJsonSchema = z.object({
  project_info: z.object({
    project_id: z.string().min(1),
  }),
  client: z.array(z.unknown()).min(1),
});

/**
 * Minimal schema for quick validation of GoogleService-Info.plist.
 * Used for initial detection before full validation.
 */
export const MinimalGoogleServiceInfoPlistSchema = z.object({
  PROJECT_ID: z.string().min(1),
  GOOGLE_APP_ID: z.string().min(1),
});

/**
 * Type inference for validated google-services.json.
 */
export type ValidatedGoogleServicesJson = z.infer<typeof GoogleServicesJsonSchema>;

/**
 * Type inference for validated GoogleService-Info.plist.
 */
export type ValidatedGoogleServiceInfoPlist = z.infer<typeof GoogleServiceInfoPlistSchema>;
