/**
 * Firebase configuration service.
 *
 * Provides detection, validation, and management of Firebase configuration files.
 *
 * @module services/firebase
 */

// API types (public)
export type { AndroidApp, FirebaseProject, IosApp } from './api';

// Detection and validation
export { detectFirebaseConfig, detectPlatform, getExpectedPaths } from './detector';

// Downloader
export type { DownloadOptions, DownloadResult } from './downloader';
export { FirebaseDownloader } from './downloader';

// Service
export { FirebaseService } from './firebase-service';

// OAuth types and utilities (public)
export type { AuthResult, OAuthFlowState, OAuthFlowStatus, OAuthTokens } from './oauth';
export { getOAuthConfigurationError, isOAuthConfigured } from './oauth';

// Types
export * from './types';

// Validators (public API)
export {
  extractProjectId,
  extractProjectIdFromPlist,
  validateBundleIdMatch,
  validateGoogleServiceInfoPlist,
  validateGoogleServicesJson,
  validatePackageNameMatch,
  validateProjectIdMatch,
} from './validator';
