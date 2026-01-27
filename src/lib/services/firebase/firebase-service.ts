/**
 * Firebase configuration service.
 *
 * Main service for detecting, validating, and managing Firebase configuration.
 *
 * @module services/firebase/firebase-service
 */

import { detectFirebaseConfig, detectPlatform, getExpectedPaths } from './detector';
import type {
  FirebaseDetectionResult,
  FirebaseRecommendation,
  FirebaseStatus,
  GoogleServiceInfoPlist,
  GoogleServicesJson,
} from './types';
import { FIREBASE_HELP_URLS, platformNeedsAndroid, platformNeedsIos } from './types';
import { extractProjectId, extractProjectIdFromPlist, validateProjectIdMatch } from './validator';

/**
 * Firebase configuration service.
 *
 * Provides methods for detecting, validating, and managing Firebase configuration.
 */
export class FirebaseService {
  private projectPath: string;
  private cachedResult: FirebaseDetectionResult | null = null;

  /**
   * Create a new FirebaseService instance.
   *
   * @param projectPath - Path to the project root directory
   */
  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Detect Firebase configuration in the project.
   *
   * @param forceRefresh - Force re-detection even if cached
   * @returns Detection result with credential files and issues
   */
  async detect(forceRefresh = false): Promise<FirebaseDetectionResult> {
    if (!forceRefresh && this.cachedResult) {
      return this.cachedResult;
    }

    this.cachedResult = await detectFirebaseConfig(this.projectPath);
    return this.cachedResult;
  }

  /**
   * Get the current Firebase configuration status.
   *
   * @returns Status summary
   */
  async getStatus(): Promise<FirebaseStatus> {
    const result = await this.detect();

    const errorCount = result.issues.filter((i) => i.severity === 'error').length;
    const warningCount = result.issues.filter((i) => i.severity === 'warning').length;

    const androidConfigured =
      !platformNeedsAndroid(result.platform) || (result.android?.valid ?? false);
    const iosConfigured = !platformNeedsIos(result.platform) || (result.ios?.valid ?? false);

    let status: 'configured' | 'partial' | 'missing';
    if (androidConfigured && iosConfigured) {
      status = 'configured';
    } else if (androidConfigured || iosConfigured) {
      status = 'partial';
    } else {
      status = 'missing';
    }

    return {
      status,
      androidConfigured,
      iosConfigured,
      issueCount: result.issues.length,
      errorCount,
      warningCount,
    };
  }

  /**
   * Get recommendations for fixing Firebase issues.
   *
   * @returns Sorted list of recommendations (highest priority first)
   */
  async getRecommendations(): Promise<FirebaseRecommendation[]> {
    const result = await this.detect();
    const recommendations: FirebaseRecommendation[] = [];

    for (const issue of result.issues) {
      let priority: number;
      let action: FirebaseRecommendation['action'];
      let title: string;

      switch (issue.type) {
        case 'missing':
          priority = 1;
          action = 'download';
          title =
            issue.platform === 'android'
              ? 'Download google-services.json'
              : 'Download GoogleService-Info.plist';
          break;
        case 'invalid':
        case 'parse_error':
          priority = 2;
          action = 'fix';
          title =
            issue.platform === 'android'
              ? 'Fix google-services.json'
              : 'Fix GoogleService-Info.plist';
          break;
        case 'misplaced':
          priority = 3;
          action = 'move';
          title =
            issue.platform === 'android'
              ? 'Move google-services.json to correct location'
              : 'Move GoogleService-Info.plist to correct location';
          break;
        case 'mismatch':
          priority = 4;
          action = 'verify';
          title = 'Verify Firebase configuration';
          break;
        default:
          priority = 5;
          action = 'verify';
          title = 'Review Firebase configuration';
      }

      recommendations.push({
        priority,
        title,
        description: issue.description,
        action,
        platform: issue.platform,
        helpUrl: issue.helpUrl,
      });
    }

    // Sort by priority
    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the expected credential file path for a platform.
   *
   * @param platform - Target platform
   * @returns Expected file path
   */
  async getExpectedPath(platform: 'android' | 'ios'): Promise<string> {
    const detectedPlatform = await detectPlatform(this.projectPath);
    const paths = getExpectedPaths(detectedPlatform, this.projectPath);
    const platformPaths = platform === 'android' ? paths.android : paths.ios;
    return (
      platformPaths[0] ||
      (platform === 'android' ? 'android/app/google-services.json' : 'ios/GoogleService-Info.plist')
    );
  }

  /**
   * Get the Firebase project ID from detected configuration.
   *
   * @returns Project ID or null if not available
   */
  async getProjectId(): Promise<string | null> {
    const result = await this.detect();

    if (result.android?.valid && result.android.content) {
      return extractProjectId(result.android.content as GoogleServicesJson);
    }

    if (result.ios?.valid && result.ios.content) {
      return extractProjectIdFromPlist(result.ios.content as GoogleServiceInfoPlist);
    }

    return null;
  }

  /**
   * Check if project IDs match between Android and iOS configurations.
   *
   * @returns True if matching or only one platform is configured
   */
  async hasMatchingProjectIds(): Promise<boolean> {
    const result = await this.detect();

    if (!result.android?.valid || !result.ios?.valid) {
      // Can't compare if one or both are missing/invalid
      return true;
    }

    const validation = validateProjectIdMatch(
      result.android.content as GoogleServicesJson,
      result.ios.content as GoogleServiceInfoPlist,
    );

    return validation.valid;
  }

  /**
   * Get a summary of the Firebase configuration for display.
   *
   * @returns Human-readable summary
   */
  async getSummary(): Promise<string> {
    const result = await this.detect();
    const status = await this.getStatus();
    const lines: string[] = [];

    lines.push(`Platform: ${result.platform}`);
    lines.push(`Status: ${status.status}`);

    if (result.android) {
      const androidStatus = result.android.valid ? 'valid' : 'invalid';
      lines.push(`Android: ${androidStatus} (${result.android.path})`);
      if (result.android.valid && result.android.content) {
        const projectId = extractProjectId(result.android.content as GoogleServicesJson);
        lines.push(`  Project ID: ${projectId}`);
      }
    } else if (
      result.platform === 'android' ||
      result.platform === 'react-native' ||
      result.platform === 'flutter'
    ) {
      lines.push('Android: missing');
    }

    if (result.ios) {
      const iosStatus = result.ios.valid ? 'valid' : 'invalid';
      lines.push(`iOS: ${iosStatus} (${result.ios.path})`);
      if (result.ios.valid && result.ios.content) {
        const projectId = extractProjectIdFromPlist(result.ios.content as GoogleServiceInfoPlist);
        lines.push(`  Project ID: ${projectId}`);
      }
    } else if (
      result.platform === 'ios' ||
      result.platform === 'react-native' ||
      result.platform === 'flutter'
    ) {
      lines.push('iOS: missing');
    }

    if (result.issues.length > 0) {
      lines.push('');
      lines.push(`Issues: ${status.errorCount} errors, ${status.warningCount} warnings`);
    }

    return lines.join('\n');
  }

  /**
   * Clear the cached detection result.
   */
  clearCache(): void {
    this.cachedResult = null;
  }

  /**
   * Get help URL for a specific topic.
   *
   * @param topic - Help topic
   * @returns Help URL
   */
  static getHelpUrl(topic: keyof typeof FIREBASE_HELP_URLS): string {
    return FIREBASE_HELP_URLS[topic];
  }
}
