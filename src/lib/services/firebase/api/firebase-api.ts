/**
 * Firebase Management API client using @googleapis/firebase.
 *
 * @module services/firebase/api/firebase-api
 */

import { firebase, type firebase_v1beta1 } from '@googleapis/firebase';
import { OAuth2Client } from 'google-auth-library';
import { oauthLogger } from '@/lib/debug/logger';
import { findProjectRoot } from '@/lib/utils/path';
import type {
  AndroidApp,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  FirebaseProject,
  IosApp,
  UpdateIosAppRequest,
} from './types';

type FirebaseApi = firebase_v1beta1.Firebase;

/**
 * Log API errors to debug.log for troubleshooting.
 */
function logApiError(operation: string, error: unknown): void {
  const errorInfo = {
    type: 'firebase_api_error',
    operation,
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
    // Extract Google API error details if available
    code: (error as { code?: number | string })?.code,
    errors: (error as { errors?: unknown[] })?.errors,
    response: (error as { response?: { data?: unknown } })?.response?.data,
  };
  oauthLogger.writeToFile(`Firebase API error: ${operation}`, errorInfo, findProjectRoot());
}

export interface ApiClientCredentials {
  clientId: string;
  clientSecret: string;
}

export class FirebaseApiClient {
  private fb: FirebaseApi;
  private auth: OAuth2Client;
  private getAccessTokenFn: () => Promise<string>;

  constructor(getAccessToken: () => Promise<string>, credentials?: ApiClientCredentials) {
    this.getAccessTokenFn = getAccessToken;

    // Create OAuth2Client with credentials if provided
    this.auth = credentials
      ? new OAuth2Client({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
        })
      : new OAuth2Client();

    this.fb = firebase({ version: 'v1beta1', auth: this.auth });
  }

  /**
   * Update OAuth2Client credentials with current access token.
   * Must be called before each API request.
   */
  private async updateCredentials(): Promise<void> {
    const token = await this.getAccessTokenFn();
    this.auth.setCredentials({
      access_token: token,
      token_type: 'Bearer',
    });
  }

  async listProjects(): Promise<FirebaseProject[]> {
    try {
      await this.updateCredentials();
      const projects: FirebaseProject[] = [];
      let pageToken: string | undefined;

      do {
        const res = await this.fb.projects.list({ pageToken });
        for (const p of res.data.results ?? []) {
          projects.push({
            name: p.name ?? '',
            projectId: p.projectId ?? '',
            projectNumber: p.projectNumber ?? '',
            displayName: p.displayName ?? '',
            state: p.state === 'DELETED' ? 'DELETED' : 'ACTIVE',
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);

      return projects;
    } catch (error) {
      logApiError('listProjects', error);
      throw error;
    }
  }

  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
    try {
      await this.updateCredentials();
      const apps: AndroidApp[] = [];
      let pageToken: string | undefined;

      do {
        const res = await this.fb.projects.androidApps.list({
          parent: `projects/${projectId}`,
          pageToken,
        });
        for (const a of res.data.apps ?? []) {
          apps.push({
            name: a.name ?? '',
            appId: a.appId ?? '',
            displayName: a.displayName ?? undefined,
            packageName: a.packageName ?? '',
            projectId: a.projectId ?? projectId,
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);

      return apps;
    } catch (error) {
      logApiError('listAndroidApps', error);
      throw error;
    }
  }

  async listIosApps(projectId: string): Promise<IosApp[]> {
    try {
      await this.updateCredentials();
      const apps: IosApp[] = [];
      let pageToken: string | undefined;

      do {
        const res = await this.fb.projects.iosApps.list({
          parent: `projects/${projectId}`,
          pageToken,
        });
        for (const a of res.data.apps ?? []) {
          apps.push({
            name: a.name ?? '',
            appId: a.appId ?? '',
            displayName: a.displayName ?? undefined,
            bundleId: a.bundleId ?? '',
            projectId: a.projectId ?? projectId,
            teamId: a.teamId ?? undefined,
            appStoreId: a.appStoreId ?? undefined,
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);

      return apps;
    } catch (error) {
      logApiError('listIosApps', error);
      throw error;
    }
  }

  async getAndroidConfig(projectId: string, appId: string): Promise<string> {
    await this.updateCredentials();
    const res = await this.fb.projects.androidApps.getConfig({
      name: `projects/${projectId}/androidApps/${appId}/config`,
    });
    return Buffer.from(res.data.configFileContents ?? '', 'base64').toString('utf-8');
  }

  async getIosConfig(projectId: string, appId: string): Promise<string> {
    await this.updateCredentials();
    const res = await this.fb.projects.iosApps.getConfig({
      name: `projects/${projectId}/iosApps/${appId}/config`,
    });
    return Buffer.from(res.data.configFileContents ?? '', 'base64').toString('utf-8');
  }

  async createAndroidApp(projectId: string, request: CreateAndroidAppRequest): Promise<AndroidApp> {
    await this.updateCredentials();
    const res = await this.fb.projects.androidApps.create({
      parent: `projects/${projectId}`,
      requestBody: request,
    });

    if (!res.data.name) {
      throw new Error('Failed to create Android app: no operation name returned');
    }
    const app = await this.waitForOperation<firebase_v1beta1.Schema$AndroidApp>(res.data.name);
    return {
      name: app.name ?? '',
      appId: app.appId ?? '',
      displayName: app.displayName ?? undefined,
      packageName: app.packageName ?? '',
      projectId: app.projectId ?? projectId,
    };
  }

  async createIosApp(projectId: string, request: CreateIosAppRequest): Promise<IosApp> {
    await this.updateCredentials();
    const res = await this.fb.projects.iosApps.create({
      parent: `projects/${projectId}`,
      requestBody: request,
    });

    if (!res.data.name) {
      throw new Error('Failed to create iOS app: no operation name returned');
    }
    const app = await this.waitForOperation<firebase_v1beta1.Schema$IosApp>(res.data.name);
    return {
      name: app.name ?? '',
      appId: app.appId ?? '',
      displayName: app.displayName ?? undefined,
      bundleId: app.bundleId ?? '',
      projectId: app.projectId ?? projectId,
      teamId: app.teamId ?? undefined,
      appStoreId: app.appStoreId ?? undefined,
    };
  }

  async patchIosApp(
    projectId: string,
    appId: string,
    request: UpdateIosAppRequest,
  ): Promise<IosApp> {
    await this.updateCredentials();
    const updateMask = Object.keys(request)
      .filter((key) => request[key as keyof UpdateIosAppRequest] !== undefined)
      .join(',');
    const res = await this.fb.projects.iosApps.patch({
      name: `projects/${projectId}/iosApps/${appId}`,
      updateMask,
      requestBody: request,
    });
    const app = res.data;
    return {
      name: app.name ?? '',
      appId: app.appId ?? '',
      displayName: app.displayName ?? undefined,
      bundleId: app.bundleId ?? '',
      projectId: app.projectId ?? projectId,
      teamId: app.teamId ?? undefined,
      appStoreId: app.appStoreId ?? undefined,
    };
  }

  private async waitForOperation<T>(operationName: string, maxWaitMs = 60000): Promise<T> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await this.updateCredentials();
      const res = await this.fb.operations.get({ name: operationName });
      if (res.data.done) {
        if (res.data.error) {
          throw new Error(`Operation failed: ${res.data.error.message}`);
        }
        if (!res.data.response) {
          throw new Error('Operation completed but returned no response');
        }
        return res.data.response as T;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Operation timed out after ${maxWaitMs}ms`);
  }
}
