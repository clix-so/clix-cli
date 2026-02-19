/**
 * Firebase config file downloader.
 *
 * Downloads google-services.json and GoogleService-Info.plist from Firebase.
 *
 * @module services/firebase/downloader
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectType } from '@/lib/config';
import type {
  AndroidApp,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  FirebaseProject,
  GcpProject,
  IosApp,
  ServiceAccountJson,
} from './api';
import { type ApiClientCredentials, FirebaseApiClient } from './api';
import { getExpectedPaths } from './detector';
import { GoogleAuthClient, getOAuthCredentials } from './oauth';
import {
  parseServiceAccountJson,
  type ServiceAccountValidationResult,
} from './service-account-validator';
import { type Platform, platformNeedsAndroid, platformNeedsIos } from './types';

/**
 * Download options.
 */
export interface DownloadOptions {
  /**
   * Project path (directory to save files).
   */
  projectPath: string;

  /**
   * Firebase project ID (optional, will prompt if not provided).
   */
  firebaseProjectId?: string;

  /**
   * Android package name for auto-matching (optional).
   */
  androidPackageName?: string;

  /**
   * iOS bundle ID for auto-matching (optional).
   */
  iosBundleId?: string;
}

/**
 * Download result.
 */
export interface DownloadResult {
  success: boolean;
  androidPath?: string;
  iosPath?: string;
  error?: string;
}

/**
 * Firebase config downloader service.
 */
export class FirebaseDownloader {
  private authClient: GoogleAuthClient;
  private apiClient: FirebaseApiClient | null = null;
  private credentials: ApiClientCredentials | null = null;

  constructor() {
    this.authClient = new GoogleAuthClient();
  }

  /**
   * Check if OAuth is configured.
   */
  isConfigured(): boolean {
    return this.authClient.isConfigured();
  }

  /**
   * Check if user is authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    return this.authClient.isAuthenticated();
  }

  /**
   * Authenticate with Google OAuth.
   *
   * @param openBrowser - Callback to open URL in browser
   * @returns Object with success status and optional error message
   */
  async authenticate(
    openBrowser: (url: string) => void,
  ): Promise<{ success: boolean; error?: string }> {
    if (await this.authClient.isAuthenticated()) {
      return { success: true };
    }

    const result = await this.authClient.authenticate(openBrowser);
    if (result.success) {
      // Fetch and store credentials for API clients
      const creds = await getOAuthCredentials();
      if (creds) {
        this.credentials = { clientId: creds.clientId, clientSecret: creds.clientSecret };
      }
      this.apiClient = new FirebaseApiClient(
        () => this.authClient.getAccessToken(),
        this.credentials ?? undefined,
      );
    }
    return result;
  }

  /**
   * Cancel in-flight Firebase OAuth authentication.
   */
  cancelAuthentication(reason = 'Firebase authentication cancelled'): void {
    this.authClient.cancelAuthentication(reason);
  }

  /**
   * Ensure API client is initialized.
   */
  private async ensureApiClient(): Promise<FirebaseApiClient> {
    if (!this.apiClient) {
      // Fetch credentials if not already cached
      if (!this.credentials) {
        const creds = await getOAuthCredentials();
        if (creds) {
          this.credentials = { clientId: creds.clientId, clientSecret: creds.clientSecret };
        }
      }
      this.apiClient = new FirebaseApiClient(
        () => this.authClient.getAccessToken(),
        this.credentials ?? undefined,
      );
    }
    return this.apiClient;
  }

  /**
   * List Firebase projects.
   */
  async listProjects(): Promise<FirebaseProject[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.listProjects();
  }

  /**
   * List Android apps in a project.
   */
  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.listAndroidApps(projectId);
  }

  /**
   * List iOS apps in a project.
   */
  async listIosApps(projectId: string): Promise<IosApp[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.listIosApps(projectId);
  }

  /**
   * Find Android app by package name.
   */
  findAppByPackageName(apps: AndroidApp[], packageName: string): AndroidApp | null {
    return apps.find((app) => app.packageName === packageName) || null;
  }

  /**
   * Find iOS app by bundle ID.
   */
  findAppByBundleId(apps: IosApp[], bundleId: string): IosApp | null {
    return apps.find((app) => app.bundleId === bundleId) || null;
  }

  /**
   * Create a new Android app in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @param request - App creation request with packageName and optional displayName
   * @returns Created Android app
   */
  async createAndroidApp(projectId: string, request: CreateAndroidAppRequest): Promise<AndroidApp> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.createAndroidApp(projectId, request);
  }

  /**
   * Create a new iOS app in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @param request - App creation request with bundleId and optional displayName
   * @returns Created iOS app
   */
  async createIosApp(projectId: string, request: CreateIosAppRequest): Promise<IosApp> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.createIosApp(projectId, request);
  }

  /**
   * Download and save Android config.
   *
   * @param projectId - Firebase project ID
   * @param appId - Android app ID
   * @param savePath - Path to save the config file
   */
  async downloadAndroidConfig(projectId: string, appId: string, savePath: string): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    const config = await api.getAndroidConfig(projectId, appId);

    const dir = path.dirname(savePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(savePath, config, 'utf-8');
  }

  /**
   * Download and save iOS config.
   *
   * @param projectId - Firebase project ID
   * @param appId - iOS app ID
   * @param savePath - Path to save the config file
   */
  async downloadIosConfig(projectId: string, appId: string, savePath: string): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    const config = await api.getIosConfig(projectId, appId);

    const dir = path.dirname(savePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(savePath, config, 'utf-8');
  }

  /**
   * Get expected save paths for config files.
   *
   * @param projectPath - Project root path
   * @param projectType - Already detected project type
   */
  getExpectedSavePaths(
    projectPath: string,
    projectType: ProjectType,
  ): { android: string | null; ios: string | null; platform: Platform } {
    const platform = this.projectTypeToPlatform(projectType);
    const paths = getExpectedPaths(platform);

    // For unknown platform, assume both platforms are needed
    const needsAndroid = platformNeedsAndroid(platform) || platform === 'unknown';
    const needsIos = platformNeedsIos(platform) || platform === 'unknown';

    return {
      android: needsAndroid ? path.join(projectPath, paths.android[0]) : null,
      ios: needsIos ? path.join(projectPath, paths.ios[0]) : null,
      platform,
    };
  }

  /**
   * Convert ProjectType to Firebase Platform.
   */
  private projectTypeToPlatform(projectType: ProjectType): Platform {
    if (projectType.framework === 'flutter') {
      return 'flutter';
    }
    if (projectType.framework === 'react-native' || projectType.framework === 'expo') {
      return 'react-native';
    }
    if (projectType.framework === 'native') {
      if (projectType.target === 'ios') return 'ios';
      if (projectType.target === 'android') return 'android';
      return 'unknown';
    }
    return 'unknown';
  }

  /**
   * Logout (clear stored tokens).
   */
  async logout(): Promise<void> {
    await this.authClient.logout();
    this.apiClient = null;
  }

  // ============================================================================
  // GCP Project and Firebase Project Management
  // ============================================================================

  /**
   * List GCP projects that don't have Firebase yet.
   *
   * These projects can have Firebase added to them.
   */
  async listAvailableGcpProjects(): Promise<GcpProject[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.listAvailableGcpProjects();
  }

  /**
   * Add Firebase to an existing GCP project.
   *
   * @param projectId - GCP project ID
   * @returns Created Firebase project
   */
  async addFirebaseToProject(projectId: string): Promise<FirebaseProject> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }
    const api = await this.ensureApiClient();
    return api.addFirebaseToProject(projectId);
  }

  // ============================================================================
  // Service Account Management
  // ============================================================================

  /**
   * Validate a Service Account JSON string.
   *
   * @param jsonString - JSON string to validate
   * @returns Validation result
   */
  validateServiceAccountJson(jsonString: string): ServiceAccountValidationResult {
    return parseServiceAccountJson(jsonString);
  }

  /**
   * Save a Service Account JSON to the project's .clix directory.
   *
   * @param projectPath - Project root path
   * @param serviceAccountJson - Service Account JSON data
   * @returns Path where the file was saved
   */
  async saveServiceAccountJson(
    projectPath: string,
    serviceAccountJson: ServiceAccountJson,
  ): Promise<string> {
    const clixDir = path.join(projectPath, '.clix');
    const savePath = path.join(clixDir, 'service-account.json');

    await fs.mkdir(clixDir, { recursive: true });
    await fs.writeFile(savePath, JSON.stringify(serviceAccountJson, null, 2), 'utf-8');

    return savePath;
  }

  /**
   * Load existing Service Account JSON from the project's .clix directory.
   *
   * @param projectPath - Project root path
   * @returns Service Account JSON or null if not found
   */
  async loadServiceAccountJson(projectPath: string): Promise<ServiceAccountJson | null> {
    const savePath = path.join(projectPath, '.clix', 'service-account.json');

    try {
      const content = await fs.readFile(savePath, 'utf-8');
      const result = parseServiceAccountJson(content);
      return result.valid && result.data ? result.data : null;
    } catch {
      return null;
    }
  }
}
