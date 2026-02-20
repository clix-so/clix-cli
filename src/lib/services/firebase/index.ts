/**
 * Firebase configuration service.
 *
 * Provides detection, validation, and management of Firebase configuration files.
 *
 * @module services/firebase
 */

// API types (public)
export type {
  AndroidApp,
  FirebaseProject,
  IosApp,
  ServiceAccountJson,
} from './api';

// Detection and validation
export { detectFirebaseConfig, getExpectedPaths } from './detector';

// Downloader
export type { DownloadOptions, DownloadResult } from './downloader';
export { FirebaseDownloader } from './downloader';

// Service
export { FirebaseService } from './firebase-service';

// OAuth types and utilities (public)
export type { AuthResult, OAuthFlowState, OAuthFlowStatus, OAuthTokens } from './oauth';
export { getOAuthConfigurationError, isOAuthConfigured } from './oauth';

// Service Account validation
export {
  parseBase64ServiceAccountJson,
  parseServiceAccountJson,
  quickValidateServiceAccountJson,
  type ServiceAccountValidationResult,
  validateServiceAccountJson,
} from './service-account-validator';

// Types
export * from './types';

// Validators (public API)
export {
  extractProjectId,
  extractProjectIdFromPlist,
  validateGoogleServiceInfoPlist,
  validateGoogleServicesJson,
  validateProjectIdMatch,
} from './validator';
