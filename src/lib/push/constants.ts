/**
 * Constants for iOS Push Notification setup.
 *
 * @module push/constants
 */

/**
 * URLs for push notification setup.
 */
export const PUSH_SETUP_URLS = {
  /** Apple Developer Portal - Keys list */
  appleKeysPortal: 'https://developer.apple.com/account/resources/authkeys/list',
  /** Apple Developer Portal - Create new key */
  appleCreateKey: 'https://developer.apple.com/account/resources/authkeys/add',
  /** Apple Developer Portal - Team ID (Membership details) */
  appleTeamId: 'https://developer.apple.com/account#MembershipDetailsCard',
  /** Firebase Console - Cloud Messaging settings */
  firebaseConsole: (projectId: string) =>
    `https://console.firebase.google.com/project/${projectId}/settings/cloudmessaging`,
  /** Firebase Console - Project settings (fallback if no project ID) */
  firebaseConsoleGeneric: 'https://console.firebase.google.com/',
} as const;

/**
 * APNS Key creation steps for Apple Developer Portal.
 */
export const APNS_KEY_CREATION_STEPS = [
  'Click "+" to create a new key',
  'Enter a key name (e.g., "Push Notifications Key")',
  'Check "Apple Push Notifications service (APNs)"',
  'Click "Continue" then "Register"',
  'Download the .p8 file (you can only download once!)',
  'Note the Key ID shown on the page',
  'Copy the .p8 file to this project directory',
] as const;

/**
 * Firebase upload steps.
 */
export const FIREBASE_UPLOAD_STEPS = [
  'Go to "iOS app configuration" section',
  'Click "Upload" under APNs Authentication Key',
  'Select your .p8 file',
  'Enter the Key ID',
  'Enter your Team ID',
  'Click "Upload"',
] as const;
