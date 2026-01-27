/**
 * Firebase configuration types and interfaces.
 *
 * @module services/firebase/types
 */

/**
 * Supported mobile platforms.
 */
export type Platform = 'ios' | 'android' | 'react-native' | 'flutter' | 'unknown';

/**
 * Firebase credential file types.
 */
export type CredentialFileType = 'google-services' | 'google-service-info';

/**
 * Issue severity levels.
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Issue types for Firebase configuration.
 */
export type IssueType = 'missing' | 'invalid' | 'misplaced' | 'mismatch' | 'parse_error';

/**
 * Google Services JSON structure (Android).
 * Reference: https://firebase.google.com/docs/android/setup
 */
export interface GoogleServicesJson {
  project_info: {
    project_number: string;
    project_id: string;
    storage_bucket: string;
  };
  client: Array<{
    client_info: {
      mobilesdk_app_id: string;
      android_client_info: {
        package_name: string;
      };
    };
    api_key: Array<{ current_key: string }>;
    oauth_client?: Array<{
      client_id: string;
      client_type: number;
    }>;
    services?: {
      appinvite_service?: {
        other_platform_oauth_client?: Array<{
          client_id: string;
          client_type: number;
        }>;
      };
    };
  }>;
  configuration_version?: string;
}

/**
 * Google Service Info Plist structure (iOS).
 * Reference: https://firebase.google.com/docs/ios/setup
 */
export interface GoogleServiceInfoPlist {
  API_KEY: string;
  GCM_SENDER_ID: string;
  GOOGLE_APP_ID: string;
  PROJECT_ID: string;
  BUNDLE_ID: string;
  CLIENT_ID?: string;
  REVERSED_CLIENT_ID?: string;
  STORAGE_BUCKET?: string;
  DATABASE_URL?: string;
  PLIST_VERSION?: string;
  IS_ADS_ENABLED?: boolean;
  IS_ANALYTICS_ENABLED?: boolean;
  IS_APPINVITE_ENABLED?: boolean;
  IS_GCM_ENABLED?: boolean;
  IS_SIGNIN_ENABLED?: boolean;
}

/**
 * Validation error details.
 */
export interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

/**
 * Result of validating a credential file.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: GoogleServicesJson | GoogleServiceInfoPlist;
}

/**
 * Firebase credential file information.
 */
export interface FirebaseCredentialFile {
  /** File path relative to project root */
  path: string;
  /** Absolute file path */
  absolutePath: string;
  /** Target platform */
  platform: 'android' | 'ios';
  /** Credential file type */
  type: CredentialFileType;
  /** Whether file exists */
  exists: boolean;
  /** Whether file is valid */
  valid: boolean;
  /** Validation errors if any */
  errors: ValidationError[];
  /** Parsed content if valid */
  content?: GoogleServicesJson | GoogleServiceInfoPlist;
  /** Whether file is in expected location */
  inExpectedLocation: boolean;
  /** Expected location if different from actual */
  expectedPath?: string;
}

/**
 * Firebase configuration issue.
 */
export interface FirebaseIssue {
  /** Issue type */
  type: IssueType;
  /** Issue severity */
  severity: IssueSeverity;
  /** Affected platform */
  platform: 'android' | 'ios';
  /** Related file path */
  file?: string;
  /** Issue description */
  description: string;
  /** Recommended action */
  recommendation: string;
  /** Help URL for more information */
  helpUrl?: string;
}

/**
 * Result of Firebase configuration detection.
 */
export interface FirebaseDetectionResult {
  /** Detected project platform */
  platform: Platform;
  /** Android credential file info */
  android: FirebaseCredentialFile | null;
  /** iOS credential file info */
  ios: FirebaseCredentialFile | null;
  /** Whether Firebase is fully configured */
  configured: boolean;
  /** Configuration issues found */
  issues: FirebaseIssue[];
  /** Project root path */
  projectPath: string;
}

/**
 * Expected credential file paths for each platform.
 */
export interface ExpectedPaths {
  android: string[];
  ios: string[];
}

/**
 * Firebase status summary.
 */
export interface FirebaseStatus {
  /** Overall configuration status */
  status: 'configured' | 'partial' | 'missing';
  /** Android configuration status */
  androidConfigured: boolean;
  /** iOS configuration status */
  iosConfigured: boolean;
  /** Number of issues */
  issueCount: number;
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
}

/**
 * Recommendation for fixing Firebase issues.
 */
export interface FirebaseRecommendation {
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Recommendation title */
  title: string;
  /** Detailed description */
  description: string;
  /** Action to take */
  action: 'download' | 'move' | 'fix' | 'verify';
  /** Affected platform */
  platform: 'android' | 'ios';
  /** Help URL */
  helpUrl?: string;
}

/**
 * Firebase help URLs.
 */
export const FIREBASE_HELP_URLS = {
  androidSetup: 'https://firebase.google.com/docs/android/setup',
  iosSetup: 'https://firebase.google.com/docs/ios/setup',
  console: 'https://console.firebase.google.com/',
  downloadConfig: 'https://support.google.com/firebase/answer/7015592',
  reactNativeSetup: 'https://rnfirebase.io/',
  flutterSetup: 'https://firebase.google.com/docs/flutter/setup',
} as const;

/**
 * Credential action types for the wizard menu.
 */
export type CredentialAction =
  | { type: 'redetect' }
  | { type: 'redetect_platform'; platform: 'android' | 'ios' }
  | { type: 'validate'; platform: 'android' | 'ios' }
  | { type: 'help'; topic: keyof typeof FIREBASE_HELP_URLS }
  | { type: 'download' }
  | { type: 'skip' }
  | { type: 'done' };

/**
 * Wizard phase states.
 */
export type WizardPhase = 'detecting' | 'status' | 'menu' | 'validating' | 'error' | 'complete';

/**
 * Result from Firebase setup wizard.
 */
export interface FirebaseSetupResult {
  /** Whether setup was completed */
  completed: boolean;
  /** Whether setup was skipped */
  skipped: boolean;
  /** Final detection result */
  detection: FirebaseDetectionResult | null;
}

/**
 * Check if platform needs Android configuration.
 * Cross-platform frameworks (React Native, Flutter) need both platforms.
 *
 * @param platform - The detected platform
 * @returns True if Android configuration is needed
 */
export function platformNeedsAndroid(platform: Platform | string): boolean {
  return platform === 'android' || platform === 'react-native' || platform === 'flutter';
}

/**
 * Check if platform needs iOS configuration.
 * Cross-platform frameworks (React Native, Flutter) need both platforms.
 *
 * @param platform - The detected platform
 * @returns True if iOS configuration is needed
 */
export function platformNeedsIos(platform: Platform | string): boolean {
  return platform === 'ios' || platform === 'react-native' || platform === 'flutter';
}
