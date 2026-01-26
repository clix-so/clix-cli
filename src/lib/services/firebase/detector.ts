/**
 * Firebase credential file detection.
 *
 * Automatically detects Firebase configuration files in project directories.
 *
 * @module services/firebase/detector
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import plist from 'plist';
import type {
  ExpectedPaths,
  FirebaseCredentialFile,
  FirebaseDetectionResult,
  FirebaseIssue,
  Platform,
} from './types';
import { FIREBASE_HELP_URLS } from './types';
import { validateGoogleServiceInfoPlist, validateGoogleServicesJson } from './validator';

/**
 * Expected paths for google-services.json by platform.
 */
const ANDROID_SEARCH_PATHS = [
  'app/google-services.json', // Standard Android
  'android/app/google-services.json', // React Native / Flutter
];

/**
 * Misplaced paths for google-services.json that will trigger warnings.
 */
const ANDROID_MISPLACED_PATHS = [
  'google-services.json', // Root (wrong location)
  'android/google-services.json', // Android root (wrong location)
];

/**
 * Expected paths for GoogleService-Info.plist by platform.
 */
const IOS_SEARCH_PATHS = [
  'ios/GoogleService-Info.plist', // React Native
  'ios/Runner/GoogleService-Info.plist', // Flutter
  'GoogleService-Info.plist', // iOS project root
];

/**
 * Directories to ignore when scanning.
 */
const IGNORE_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'Pods']);

/**
 * Check if Flutter project (pubspec.yaml exists).
 */
async function isFlutterProject(projectPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, 'pubspec.yaml'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if React Native project.
 */
async function isReactNativeProject(projectPath: string): Promise<boolean> {
  try {
    const packageJson = await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(packageJson);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps['react-native'] || deps.expo);
  } catch {
    return false;
  }
}

/**
 * Check if directory has build.gradle files.
 */
async function hasBuildGradle(projectPath: string, dirName: string): Promise<boolean> {
  const gradlePath = path.join(projectPath, dirName, 'build.gradle');
  const gradleKtsPath = path.join(projectPath, dirName, 'build.gradle.kts');
  try {
    await fs.access(gradlePath);
    return true;
  } catch {
    try {
      await fs.access(gradleKtsPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check directory entry for iOS indicators.
 */
function isIosIndicator(entryName: string): boolean {
  return (
    entryName === 'ios' || entryName.endsWith('.xcodeproj') || entryName.endsWith('.xcworkspace')
  );
}

/**
 * Check file entry for Android indicators.
 */
function isAndroidFile(fileName: string): boolean {
  return (
    fileName === 'build.gradle' ||
    fileName === 'build.gradle.kts' ||
    fileName === 'AndroidManifest.xml'
  );
}

/**
 * Detect native platforms from directory entries.
 */
async function detectNativePlatforms(
  projectPath: string,
): Promise<{ hasIos: boolean; hasAndroid: boolean }> {
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  let hasIos = false;
  let hasAndroid = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isIosIndicator(entry.name)) {
        hasIos = true;
      }
      if (entry.name === 'android' || entry.name === 'app') {
        if (await hasBuildGradle(projectPath, entry.name)) {
          hasAndroid = true;
        }
      }
    }
    if (entry.isFile() && isAndroidFile(entry.name)) {
      hasAndroid = true;
    }
  }

  return { hasIos, hasAndroid };
}

/**
 * Detect the project platform based on project files.
 */
export async function detectPlatform(projectPath: string): Promise<Platform> {
  try {
    // Check for cross-platform frameworks first
    if (await isFlutterProject(projectPath)) {
      return 'flutter';
    }

    if (await isReactNativeProject(projectPath)) {
      return 'react-native';
    }

    // Check for native platforms
    const { hasIos, hasAndroid } = await detectNativePlatforms(projectPath);

    if (hasIos && hasAndroid) {
      // For dual-platform native projects without cross-platform framework,
      // return 'unknown' to check all common locations
      return 'unknown';
    }
    if (hasIos) {
      return 'ios';
    }
    if (hasAndroid) {
      return 'android';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get expected credential file paths based on platform.
 */
export function getExpectedPaths(platform: Platform, _projectPath: string): ExpectedPaths {
  const androidPaths: string[] = [];
  const iosPaths: string[] = [];

  switch (platform) {
    case 'react-native':
      androidPaths.push('android/app/google-services.json');
      iosPaths.push('ios/GoogleService-Info.plist');
      break;
    case 'flutter':
      androidPaths.push('android/app/google-services.json');
      iosPaths.push('ios/Runner/GoogleService-Info.plist');
      break;
    case 'android':
      androidPaths.push('app/google-services.json');
      break;
    case 'ios':
      iosPaths.push('GoogleService-Info.plist');
      // Also check for app-specific directories
      break;
    default:
      // For unknown, check all common locations
      androidPaths.push(...ANDROID_SEARCH_PATHS);
      iosPaths.push(...IOS_SEARCH_PATHS);
  }

  return { android: androidPaths, ios: iosPaths };
}

/**
 * Check if a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file.
 */
async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Read and parse a plist file (JSON or XML format).
 */
async function readPlistFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  const trimmed = content.trim();

  // Try JSON format first (faster)
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(content);
    } catch {
      // Fall through to plist parser
    }
  }

  // Try XML plist format
  if (trimmed.includes('<?xml') || trimmed.includes('<plist')) {
    return plist.parse(content);
  }

  // If neither format detected, try JSON as last resort
  return JSON.parse(content);
}

/**
 * Find google-services.json files in the project.
 */
export async function findGoogleServicesJson(
  projectPath: string,
): Promise<{ path: string; inExpectedLocation: boolean }[]> {
  const results: { path: string; inExpectedLocation: boolean }[] = [];

  // Check expected locations first
  for (const searchPath of ANDROID_SEARCH_PATHS) {
    const fullPath = path.join(projectPath, searchPath);
    if (await fileExists(fullPath)) {
      results.push({ path: searchPath, inExpectedLocation: true });
    }
  }

  // Check misplaced locations
  for (const misplacedPath of ANDROID_MISPLACED_PATHS) {
    const fullPath = path.join(projectPath, misplacedPath);
    if (await fileExists(fullPath)) {
      // Only add if not already found in expected locations
      if (!results.some((r) => r.path === misplacedPath)) {
        results.push({ path: misplacedPath, inExpectedLocation: false });
      }
    }
  }

  return results;
}

/**
 * Find GoogleService-Info.plist files in the project.
 */
export async function findGoogleServiceInfoPlist(
  projectPath: string,
): Promise<{ path: string; inExpectedLocation: boolean }[]> {
  const results: { path: string; inExpectedLocation: boolean }[] = [];

  // Check expected locations
  for (const searchPath of IOS_SEARCH_PATHS) {
    const fullPath = path.join(projectPath, searchPath);
    if (await fileExists(fullPath)) {
      results.push({ path: searchPath, inExpectedLocation: true });
    }
  }

  // Also search for app-specific plist locations in iOS directory
  const iosDir = path.join(projectPath, 'ios');
  try {
    const entries = await fs.readdir(iosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        const plistPath = path.join('ios', entry.name, 'GoogleService-Info.plist');
        const fullPath = path.join(projectPath, plistPath);
        if (await fileExists(fullPath)) {
          if (!results.some((r) => r.path === plistPath)) {
            results.push({ path: plistPath, inExpectedLocation: true });
          }
        }
      }
    }
  } catch {
    // iOS directory doesn't exist or can't be read
  }

  // Search for native iOS projects at root level (sibling directories to .xcodeproj)
  try {
    const rootEntries = await fs.readdir(projectPath, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name) && entry.name !== 'ios') {
        const plistPath = path.join(entry.name, 'GoogleService-Info.plist');
        const fullPath = path.join(projectPath, plistPath);
        if (await fileExists(fullPath)) {
          if (!results.some((r) => r.path === plistPath)) {
            results.push({ path: plistPath, inExpectedLocation: true });
          }
        }
      }
    }
  } catch {
    // Root directory can't be read
  }

  return results;
}

/**
 * Detect and validate Android Firebase credential file.
 */
async function detectAndroidCredential(
  projectPath: string,
  expectedPaths: string[],
): Promise<FirebaseCredentialFile | null> {
  const found = await findGoogleServicesJson(projectPath);

  if (found.length === 0) {
    return null;
  }

  // Use the first found file (prefer platform-specific expected locations)
  const expectedFile = found.find((f) => expectedPaths.includes(f.path));
  const file = expectedFile || found[0];
  const inExpectedLocation =
    expectedPaths.length === 0 ? file.inExpectedLocation : expectedPaths.includes(file.path);
  const absolutePath = path.join(projectPath, file.path);

  try {
    const content = await readJsonFile(absolutePath);
    const validation = validateGoogleServicesJson(content);

    return {
      path: file.path,
      absolutePath,
      platform: 'android',
      type: 'google-services',
      exists: true,
      valid: validation.valid,
      errors: validation.errors,
      content: validation.valid
        ? (validation.data as FirebaseCredentialFile['content'])
        : undefined,
      inExpectedLocation,
      expectedPath: !inExpectedLocation ? expectedPaths[0] : undefined,
    };
  } catch (error) {
    return {
      path: file.path,
      absolutePath,
      platform: 'android',
      type: 'google-services',
      exists: true,
      valid: false,
      errors: [
        {
          path: 'root',
          message:
            error instanceof SyntaxError
              ? 'Invalid JSON format'
              : `Failed to read file: ${String(error)}`,
          code: 'PARSE_ERROR',
        },
      ],
      inExpectedLocation,
      expectedPath: !inExpectedLocation ? expectedPaths[0] : undefined,
    };
  }
}

/**
 * Detect and validate iOS Firebase credential file.
 */
async function detectIosCredential(
  projectPath: string,
  expectedPaths: string[],
): Promise<FirebaseCredentialFile | null> {
  const found = await findGoogleServiceInfoPlist(projectPath);

  if (found.length === 0) {
    return null;
  }

  // Use file in expected location if available, otherwise first found
  const expectedFile = found.find((f) => expectedPaths.includes(f.path));
  const file = expectedFile || found[0];
  const absolutePath = path.join(projectPath, file.path);
  // Determine if file is in expected location based on expectedPaths parameter
  const inExpectedLocation =
    expectedPaths.length === 0 ? file.inExpectedLocation : expectedPaths.includes(file.path);

  try {
    const content = await readPlistFile(absolutePath);
    const validation = validateGoogleServiceInfoPlist(content);

    return {
      path: file.path,
      absolutePath,
      platform: 'ios',
      type: 'google-service-info',
      exists: true,
      valid: validation.valid,
      errors: validation.errors,
      content: validation.valid
        ? (validation.data as FirebaseCredentialFile['content'])
        : undefined,
      inExpectedLocation,
      expectedPath: !inExpectedLocation ? expectedPaths[0] : undefined,
    };
  } catch (error) {
    return {
      path: file.path,
      absolutePath,
      platform: 'ios',
      type: 'google-service-info',
      exists: true,
      valid: false,
      errors: [
        {
          path: 'root',
          message: `Invalid plist format: ${error instanceof Error ? error.message : String(error)}`,
          code: 'PARSE_ERROR',
        },
      ],
      inExpectedLocation,
      expectedPath: !inExpectedLocation ? expectedPaths[0] : undefined,
    };
  }
}

/**
 * Check if platform needs Android config.
 */
function needsAndroidConfig(platform: Platform): boolean {
  return platform === 'android' || platform === 'react-native' || platform === 'flutter';
}

/**
 * Check if platform needs iOS config.
 */
function needsIosConfig(platform: Platform): boolean {
  return platform === 'ios' || platform === 'react-native' || platform === 'flutter';
}

/**
 * Generate Android-specific issues.
 */
function generateAndroidIssues(
  android: FirebaseCredentialFile | null,
  expectedPath: string,
): FirebaseIssue[] {
  if (!android) {
    return [
      {
        type: 'missing',
        severity: 'error',
        platform: 'android',
        description: 'google-services.json not found',
        recommendation: `Download from Firebase Console and place in ${expectedPath || 'android/app/'}`,
        helpUrl: FIREBASE_HELP_URLS.downloadConfig,
      },
    ];
  }

  const issues: FirebaseIssue[] = [];

  if (!android.valid && android.errors.length > 0) {
    const parseError = android.errors.find((e) => e.code === 'PARSE_ERROR');
    if (parseError) {
      issues.push({
        type: 'parse_error',
        severity: 'error',
        platform: 'android',
        file: android.path,
        description: parseError.message,
        recommendation: 'Re-download the file from Firebase Console or fix the JSON syntax',
        helpUrl: FIREBASE_HELP_URLS.downloadConfig,
      });
    } else {
      issues.push({
        type: 'invalid',
        severity: 'error',
        platform: 'android',
        file: android.path,
        description: `Invalid google-services.json: ${android.errors.map((e) => e.message).join(', ')}`,
        recommendation: 'Re-download the file from Firebase Console',
        helpUrl: FIREBASE_HELP_URLS.downloadConfig,
      });
    }
  }

  if (!android.inExpectedLocation) {
    issues.push({
      type: 'misplaced',
      severity: 'warning',
      platform: 'android',
      file: android.path,
      description: `google-services.json found in unexpected location: ${android.path}`,
      recommendation: `Move to ${android.expectedPath || expectedPath}`,
      helpUrl: FIREBASE_HELP_URLS.androidSetup,
    });
  }

  return issues;
}

/**
 * Generate iOS-specific issues.
 */
function generateIosIssues(
  ios: FirebaseCredentialFile | null,
  expectedPath: string,
): FirebaseIssue[] {
  if (!ios) {
    return [
      {
        type: 'missing',
        severity: 'error',
        platform: 'ios',
        description: 'GoogleService-Info.plist not found',
        recommendation: `Download from Firebase Console and place in ${expectedPath || 'ios/'}`,
        helpUrl: FIREBASE_HELP_URLS.downloadConfig,
      },
    ];
  }

  const issues: FirebaseIssue[] = [];

  if (!ios.valid && ios.errors.length > 0) {
    const parseError = ios.errors.find((e) => e.code === 'PARSE_ERROR');
    if (parseError) {
      issues.push({
        type: 'parse_error',
        severity: 'warning', // plist XML format is common, make it warning
        platform: 'ios',
        file: ios.path,
        description: parseError.message,
        recommendation: 'Ensure the file is valid. XML plist files are supported by Xcode.',
        helpUrl: FIREBASE_HELP_URLS.iosSetup,
      });
    } else {
      issues.push({
        type: 'invalid',
        severity: 'error',
        platform: 'ios',
        file: ios.path,
        description: `Invalid GoogleService-Info.plist: ${ios.errors.map((e) => e.message).join(', ')}`,
        recommendation: 'Re-download the file from Firebase Console',
        helpUrl: FIREBASE_HELP_URLS.downloadConfig,
      });
    }
  }

  if (!ios.inExpectedLocation) {
    issues.push({
      type: 'misplaced',
      severity: 'warning',
      platform: 'ios',
      file: ios.path,
      description: `GoogleService-Info.plist found in unexpected location: ${ios.path}`,
      recommendation: `Move to ${ios.expectedPath || expectedPath}`,
      helpUrl: FIREBASE_HELP_URLS.iosSetup,
    });
  }

  return issues;
}

/**
 * Generate issues based on detection results.
 */
function generateIssues(
  android: FirebaseCredentialFile | null,
  ios: FirebaseCredentialFile | null,
  platform: Platform,
  expectedPaths: ExpectedPaths,
): FirebaseIssue[] {
  const issues: FirebaseIssue[] = [];

  if (needsAndroidConfig(platform)) {
    issues.push(...generateAndroidIssues(android, expectedPaths.android[0]));
  }

  if (needsIosConfig(platform)) {
    issues.push(...generateIosIssues(ios, expectedPaths.ios[0]));
  }

  return issues;
}

/**
 * Detect Firebase configuration in a project.
 *
 * @param projectPath - Path to the project root
 * @returns Detection result with credential files and issues
 */
export async function detectFirebaseConfig(projectPath: string): Promise<FirebaseDetectionResult> {
  const platform = await detectPlatform(projectPath);
  const expectedPaths = getExpectedPaths(platform, projectPath);

  const android = await detectAndroidCredential(projectPath, expectedPaths.android);
  const ios = await detectIosCredential(projectPath, expectedPaths.ios);

  const issues = generateIssues(android, ios, platform, expectedPaths);

  // Determine if Firebase is configured
  // For unknown platform, check if at least one valid config file exists
  const needsAndroid =
    platform === 'android' || platform === 'react-native' || platform === 'flutter';
  const needsIos = platform === 'ios' || platform === 'react-native' || platform === 'flutter';

  let configured: boolean;
  if (platform === 'unknown') {
    // For unknown platform, configured is true only if at least one valid config exists
    configured = (android?.valid ?? false) || (ios?.valid ?? false);
  } else {
    const androidConfigured = !needsAndroid || (android?.valid ?? false);
    const iosConfigured = !needsIos || (ios?.valid ?? false);
    configured = androidConfigured && iosConfigured;
  }

  return {
    platform,
    android,
    ios,
    configured,
    issues,
    projectPath,
  };
}
