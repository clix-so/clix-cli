/**
 * Project type detection.
 *
 * Detects the framework and target platform of a mobile project.
 *
 * @module services/project-detector
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ProjectFramework, ProjectTargetPlatform, ProjectType } from '@/lib/config';

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists.
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if Flutter project (pubspec.yaml exists).
 */
export async function isFlutterProject(projectPath: string): Promise<boolean> {
  return fileExists(path.join(projectPath, 'pubspec.yaml'));
}

/**
 * Read and parse package.json dependencies.
 */
async function readPackageDependencies(
  projectPath: string,
): Promise<Record<string, string> | null> {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return null;
  }
}

/**
 * Check if Expo project (has expo dependency).
 */
async function isExpoProject(projectPath: string): Promise<boolean> {
  const deps = await readPackageDependencies(projectPath);
  return deps !== null && 'expo' in deps;
}

/**
 * Check if React Native project (has react-native but not expo).
 */
async function isReactNativeProject(projectPath: string): Promise<boolean> {
  const deps = await readPackageDependencies(projectPath);
  if (deps === null) return false;
  return 'react-native' in deps && !('expo' in deps);
}

/**
 * Check if directory has iOS project indicators.
 */
async function hasIosProject(projectPath: string): Promise<boolean> {
  // Check for ios/ directory
  if (await directoryExists(path.join(projectPath, 'ios'))) {
    return true;
  }

  // Check for .xcodeproj or .xcworkspace at root level
  try {
    const entries = await fs.readdir(projectPath, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.endsWith('.xcodeproj') || entry.name.endsWith('.xcworkspace')),
    );
  } catch {
    return false;
  }
}

/**
 * Check if directory has Android project indicators.
 */
async function hasAndroidProject(projectPath: string): Promise<boolean> {
  // Check for android/ directory with build.gradle
  const androidDir = path.join(projectPath, 'android');
  if (await directoryExists(androidDir)) {
    const hasGradle =
      (await fileExists(path.join(androidDir, 'build.gradle'))) ||
      (await fileExists(path.join(androidDir, 'build.gradle.kts')));
    if (hasGradle) return true;
  }

  // Check for app/ directory with build.gradle (native Android)
  const appDir = path.join(projectPath, 'app');
  if (await directoryExists(appDir)) {
    const hasGradle =
      (await fileExists(path.join(appDir, 'build.gradle'))) ||
      (await fileExists(path.join(appDir, 'build.gradle.kts')));
    if (hasGradle) return true;
  }

  // Check for build.gradle at root (native Android)
  if (
    (await fileExists(path.join(projectPath, 'build.gradle'))) ||
    (await fileExists(path.join(projectPath, 'build.gradle.kts')))
  ) {
    return true;
  }

  return false;
}

/**
 * Detect target platform based on project structure.
 */
async function detectTargetPlatform(projectPath: string): Promise<ProjectTargetPlatform> {
  const hasIos = await hasIosProject(projectPath);
  const hasAndroid = await hasAndroidProject(projectPath);

  if (hasIos && hasAndroid) {
    return 'ios-android';
  }
  if (hasIos) {
    return 'ios';
  }
  if (hasAndroid) {
    return 'android';
  }

  return 'unknown';
}

/**
 * Detect project framework.
 */
async function detectFramework(projectPath: string): Promise<ProjectFramework> {
  // Check cross-platform frameworks first (order matters)
  if (await isFlutterProject(projectPath)) {
    return 'flutter';
  }

  if (await isExpoProject(projectPath)) {
    return 'expo';
  }

  if (await isReactNativeProject(projectPath)) {
    return 'react-native';
  }

  // Check for native projects
  const hasIos = await hasIosProject(projectPath);
  const hasAndroid = await hasAndroidProject(projectPath);

  if (hasIos || hasAndroid) {
    return 'native';
  }

  return 'unknown';
}

/**
 * Detect project type (framework + target platform).
 *
 * @param projectPath - Path to the project root
 * @returns Detected project type (unknown if not detected)
 */
export async function detectProjectType(projectPath: string): Promise<ProjectType> {
  try {
    const framework = await detectFramework(projectPath);
    const target = await detectTargetPlatform(projectPath);
    return { framework, target };
  } catch {
    return { framework: 'unknown', target: 'unknown' };
  }
}

/**
 * Format project type for display.
 *
 * @param type - Project type object
 * @returns Human-readable string (e.g., "expo (iOS/Android)")
 */
export function formatProjectType(type: ProjectType): string {
  if (type.framework === 'unknown' && type.target === 'unknown') {
    return 'unknown';
  }

  const targetLabel =
    type.target === 'ios-android'
      ? 'iOS/Android'
      : type.target === 'ios'
        ? 'iOS'
        : type.target === 'android'
          ? 'Android'
          : 'unknown';

  if (type.framework === 'native') {
    return `${targetLabel} native`;
  }

  if (type.framework === 'unknown') {
    return `unknown (${targetLabel})`;
  }

  return `${type.framework} (${targetLabel})`;
}

/**
 * Detect Android package name from project files.
 *
 * Checks build.gradle namespace (AGP 7+) first, then AndroidManifest.xml package attribute.
 * Supports both cross-platform (android/app/) and native Android (app/) layouts.
 */
export async function detectAndroidPackageName(projectPath: string): Promise<string | undefined> {
  const gradlePaths = [
    path.join(projectPath, 'android/app/build.gradle'),
    path.join(projectPath, 'android/app/build.gradle.kts'),
    path.join(projectPath, 'app/build.gradle'),
    path.join(projectPath, 'app/build.gradle.kts'),
  ];

  for (const gradlePath of gradlePaths) {
    try {
      const content = await fs.readFile(gradlePath, 'utf-8');
      const match = content.match(/namespace\s*[=]?\s*["']([^"']+)["']/);
      if (match?.[1]) return match[1];
    } catch {
      // file not found
    }
  }

  const manifestPaths = [
    path.join(projectPath, 'android/app/src/main/AndroidManifest.xml'),
    path.join(projectPath, 'app/src/main/AndroidManifest.xml'),
  ];

  for (const manifestPath of manifestPaths) {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const match = content.match(/package\s*=\s*["']([^"']+)["']/);
      if (match?.[1]) return match[1];
    } catch {
      // file not found
    }
  }

  return undefined;
}
