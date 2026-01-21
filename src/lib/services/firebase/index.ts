/**
 * Firebase configuration service.
 *
 * Provides detection, validation, and management of Firebase configuration files.
 *
 * @module services/firebase
 */

export type { AndroidApp, FirebaseProject, IosApp } from './api';
// API module
export { FirebaseApiClient } from './api';

// Detection and validation
export { detectFirebaseConfig, detectPlatform, getExpectedPaths } from './detector';
export type { DownloadOptions, DownloadResult } from './downloader';
// Downloader
export { FirebaseDownloader } from './downloader';
export { FirebaseService } from './firebase-service';
export type { AuthResult, OAuthFlowState, OAuthFlowStatus, OAuthTokens } from './oauth';

// OAuth module
export {
  GOOGLE_OAUTH_CONFIG,
  GoogleAuthClient,
  getOAuthConfigurationError,
  isOAuthConfigured,
  TokenStore,
} from './oauth';
export {
  GoogleServiceInfoPlistSchema,
  GoogleServicesJsonSchema,
  MinimalGoogleServiceInfoPlistSchema,
  MinimalGoogleServicesJsonSchema,
} from './schemas';
export * from './types';
export {
  extractProjectId,
  extractProjectIdFromPlist,
  validateBundleIdMatch,
  validateGoogleServiceInfoPlist,
  validateGoogleServicesJson,
  validatePackageNameMatch,
  validateProjectIdMatch,
} from './validator';
