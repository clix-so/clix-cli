/**
 * Firebase Management REST API client.
 *
 * @module services/firebase/api/firebase-api
 */

import type {
  AndroidApp,
  AppConfigResponse,
  FirebaseProject,
  IosApp,
  ListAndroidAppsResponse,
  ListIosAppsResponse,
  ListProjectsResponse,
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
   * Make an authenticated request to the Firebase API.
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
   * List all Firebase projects accessible to the user.
   *
   * @returns List of Firebase projects
   */
  async listProjects(): Promise<FirebaseProject[]> {
    const projects: FirebaseProject[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const query = params.toString();
      const path = query ? `/projects?${query}` : '/projects';
      const response = await this.request<ListProjectsResponse>(path);

      if (response.results) {
        projects.push(...response.results);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return projects;
  }

  /**
   * List Android apps in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @returns List of Android apps
   */
  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
    const apps: AndroidApp[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const query = params.toString();
      const path = query
        ? `/projects/${projectId}/androidApps?${query}`
        : `/projects/${projectId}/androidApps`;
      const response = await this.request<ListAndroidAppsResponse>(path);

      if (response.apps) {
        apps.push(...response.apps);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return apps;
  }

  /**
   * List iOS apps in a Firebase project.
   *
   * @param projectId - Firebase project ID
   * @returns List of iOS apps
   */
  async listIosApps(projectId: string): Promise<IosApp[]> {
    const apps: IosApp[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const query = params.toString();
      const path = query
        ? `/projects/${projectId}/iosApps?${query}`
        : `/projects/${projectId}/iosApps`;
      const response = await this.request<ListIosAppsResponse>(path);

      if (response.apps) {
        apps.push(...response.apps);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return apps;
  }

  /**
   * Get Android app config (google-services.json).
   *
   * @param projectId - Firebase project ID
   * @param appId - Android app ID
   * @returns Config file contents as string
   */
  async getAndroidConfig(projectId: string, appId: string): Promise<string> {
    const response = await this.request<AppConfigResponse>(
      `/projects/${projectId}/androidApps/${appId}/config`,
    );

    return Buffer.from(response.configFileContents, 'base64').toString('utf-8');
  }

  /**
   * Get iOS app config (GoogleService-Info.plist).
   *
   * @param projectId - Firebase project ID
   * @param appId - iOS app ID
   * @returns Config file contents as string
   */
  async getIosConfig(projectId: string, appId: string): Promise<string> {
    const response = await this.request<AppConfigResponse>(
      `/projects/${projectId}/iosApps/${appId}/config`,
    );

    return Buffer.from(response.configFileContents, 'base64').toString('utf-8');
  }
}
