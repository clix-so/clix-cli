/**
 * Firebase Management REST API client.
 *
 * @module services/firebase/api/firebase-api
 */

import type {
  AndroidApp,
  AppConfigResponse,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  FirebaseProject,
  IosApp,
  ListAndroidAppsResponse,
  ListIosAppsResponse,
  ListProjectsResponse,
  Operation,
} from './types';

const BASE_URL = 'https://firebase.googleapis.com/v1beta1';

/**
 * Firebase Management API client.
 *
 * Uses the Firebase Management REST API to list projects, apps, and download configs.
 */
export class FirebaseApiClient {
  private getAccessToken: () => Promise<string>;

  /**
   * Create a new Firebase API client.
   *
   * @param getAccessToken - Function to get a valid access token
   */
  constructor(getAccessToken: () => Promise<string>) {
    this.getAccessToken = getAccessToken;
  }

  /**
   * Make an authenticated GET request to the Firebase API.
   */
  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${BASE_URL}${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firebase API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated POST request to the Firebase API.
   */
  private async postRequest<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${BASE_URL}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firebase API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Wait for a long-running operation to complete.
   *
   * @param operationName - Operation name from the initial response
   * @param maxWaitMs - Maximum time to wait in milliseconds (default: 60s)
   * @returns The completed operation result
   */
  private async waitForOperation<T>(operationName: string, maxWaitMs = 60000): Promise<T> {
    const startTime = Date.now();
    const pollIntervalMs = 1000;

    while (Date.now() - startTime < maxWaitMs) {
      const operation = await this.request<Operation<T>>(`/${operationName}`.replace(/^\/+/, '/'));

      if (operation.done) {
        if (operation.error) {
          throw new Error(`Operation failed: ${operation.error.message}`);
        }
        if (!operation.response) {
          throw new Error('Operation completed but no response returned');
        }
        return operation.response;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Operation timed out after ${maxWaitMs}ms`);
  }

  /**
   * Fetch paginated results from the Firebase API.
   *
   * @param basePath - Base path for the API endpoint
   * @param extractor - Function to extract items from response
   * @returns All items across all pages
   */
  private async fetchPaginated<T, R extends { nextPageToken?: string }>(
    basePath: string,
    extractor: (response: R) => T[] | undefined,
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const query = params.toString();
      const path = query ? `${basePath}?${query}` : basePath;
      const response = await this.request<R>(path);

      const extracted = extractor(response);
      if (extracted) {
        items.push(...extracted);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return items;
  }

  /**
   * Fetch config file contents from the Firebase API.
   *
   * @param path - API path for the config endpoint
   * @returns Config file contents as string
   */
  private async fetchConfig(path: string): Promise<string> {
    const response = await this.request<AppConfigResponse>(path);
    return Buffer.from(response.configFileContents, 'base64').toString('utf-8');
  }

  /**
   * Create an app and wait for the operation to complete.
   *
   * @param path - API path for the app creation endpoint
   * @param request - App creation request
   * @returns Created app
   */
  private async createAppWithOperation<T>(path: string, request: unknown): Promise<T> {
    const operation = await this.postRequest<Operation<T>>(path, request);

    // If operation is already done, return the result
    if (operation.done && operation.response) {
      return operation.response;
    }

    // Otherwise, wait for the operation to complete
    return this.waitForOperation<T>(operation.name);
  }

  /**
   * List all Firebase projects accessible to the user.
   *
   * @returns List of Firebase projects
   */
  async listProjects(): Promise<FirebaseProject[]> {
    return this.fetchPaginated<FirebaseProject, ListProjectsResponse>(
      '/projects',
      (response) => response.results,
    );
  }

  /**
   * List Android apps in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @returns List of Android apps
   */
  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
    return this.fetchPaginated<AndroidApp, ListAndroidAppsResponse>(
      `/projects/${projectId}/androidApps`,
      (response) => response.apps,
    );
  }

  /**
   * List iOS apps in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @returns List of iOS apps
   */
  async listIosApps(projectId: string): Promise<IosApp[]> {
    return this.fetchPaginated<IosApp, ListIosAppsResponse>(
      `/projects/${projectId}/iosApps`,
      (response) => response.apps,
    );
  }

  /**
   * Get Android app config (google-services.json).
   *
   * @param projectId - Firebase project ID
   * @param appId - Android app ID
   * @returns Config file contents as string
   */
  async getAndroidConfig(projectId: string, appId: string): Promise<string> {
    return this.fetchConfig(`/projects/${projectId}/androidApps/${appId}/config`);
  }

  /**
   * Get iOS app config (GoogleService-Info.plist).
   *
   * @param projectId - Firebase project ID
   * @param appId - iOS app ID
   * @returns Config file contents as string
   */
  async getIosConfig(projectId: string, appId: string): Promise<string> {
    return this.fetchConfig(`/projects/${projectId}/iosApps/${appId}/config`);
  }

  /**
   * Create a new Android app in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @param request - App creation request with packageName and optional displayName
   * @returns Created Android app
   */
  async createAndroidApp(projectId: string, request: CreateAndroidAppRequest): Promise<AndroidApp> {
    return this.createAppWithOperation<AndroidApp>(`/projects/${projectId}/androidApps`, request);
  }

  /**
   * Create a new iOS app in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @param request - App creation request with bundleId and optional displayName
   * @returns Created iOS app
   */
  async createIosApp(projectId: string, request: CreateIosAppRequest): Promise<IosApp> {
    return this.createAppWithOperation<IosApp>(`/projects/${projectId}/iosApps`, request);
  }
}
