/**
 * Types for iOS Push Notification setup.
 *
 * @module push/types
 */

/**
 * APNS Push Key information.
 * Based on EAS CLI's PushKey type.
 */
export interface ApnsPushKey {
  /** P8 file content */
  apnsKeyP8: string;
  /** 10-character Key ID (e.g., ABCD123456) */
  apnsKeyId: string;
  /** Apple Team ID */
  teamId: string;
}

/**
 * Push setup task context.
 */
export interface PushSetupContext {
  // Project info
  bundleId: string | null;
  firebaseProjectId: string | null;
  // APNS Key info
  pushKey: ApnsPushKey | null;
  p8FilePath: string | null;
}

/**
 * Push setup task phases.
 */
export type PushSetupTaskPhase =
  | 'detecting' // Analyzing project
  | 'status' // Showing current status
  | 'key_source' // Asking if user has existing key
  | 'apple_login' // Apple account login for auto key creation
  | 'apple_guide' // Apple Portal guide (manual)
  | 'p8_input' // P8 + Key ID + Team ID input
  | 'validation' // Validating inputs
  | 'firebase_auth' // Authenticating with Firebase
  | 'firebase_projects' // Selecting Firebase project
  | 'firebase_upload' // Firebase upload guide
  | 'complete' // Setup complete
  | 'error'; // Error state

/**
 * Push setup task result.
 */
export interface PushSetupTaskResult {
  success: boolean;
  message: string;
  context?: PushSetupContext;
}
