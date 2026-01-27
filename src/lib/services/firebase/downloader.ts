/**
 * Firebase config file downloader.
 *
 * Downloads google-services.json and GoogleService-Info.plist from Firebase.
 *
 * @module services/firebase/downloader
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AndroidApp,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  FirebaseProject,
  IosApp,
} from './api';
import { FirebaseApiClient } from './api';
import { detectPlatform, getExpectedPaths } from './detector';
import { GoogleAuthClient } from './oauth';
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
    const result = await this.authClient.authenticate(openBrowser);
    if (result.success) {
      this.apiClient = new FirebaseApiClient(() => this.authClient.getAccessToken());
    }
    return result;
  }

  /**
   * Ensure API client is initialized.
   */
  private ensureApiClient(): FirebaseApiClient {
    if (!this.apiClient) {
      this.apiClient = new FirebaseApiClient(() => this.authClient.getAccessToken());
    }
    return this.apiClient;
  }

  /**
   * List Firebase projects.
   */
  async listProjects(): Promise<FirebaseProject[]> {
    const api = this.ensureApiClient();
    return api.listProjects();
  }

  /**
   * List Android apps in a project.
   */
  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
    const api = this.ensureApiClient();
    return api.listAndroidApps(projectId);
  }

  /**
   * List iOS apps in a project.
   */
  async listIosApps(projectId: string): Promise<IosApp[]> {
    const api = this.ensureApiClient();
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
    const api = this.ensureApiClient();
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
    const api = this.ensureApiClient();
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
    const api = this.ensureApiClient();
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
    const api = this.ensureApiClient();
    const config = await api.getIosConfig(projectId, appId);

    const dir = path.dirname(savePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(savePath, config, 'utf-8');
  }

  /**
   * Get expected save paths for config files.
   */
  async getExpectedSavePaths(
    projectPath: string,
  ): Promise<{ android: string | null; ios: string | null; platform: Platform }> {
    const platform = await detectPlatform(projectPath);
    const paths = getExpectedPaths(platform, projectPath);

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
   * Logout (clear stored tokens).
   */
  async logout(): Promise<void> {
    await this.authClient.logout();
    this.apiClient = null;
  }
}
