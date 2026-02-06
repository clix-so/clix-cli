/**
 * Firebase Management API client using @googleapis/firebase.
 *
 * @module services/firebase/api/firebase-api
 */

import {
  cloudresourcemanager,
  type cloudresourcemanager_v1,
} from '@googleapis/cloudresourcemanager';
import { firebase, type firebase_v1beta1 } from '@googleapis/firebase';
import { OAuth2Client } from 'google-auth-library';
import type {
  AndroidApp,
  CreateAndroidAppRequest,
  CreateIosAppRequest,
  FirebaseProject,
  GcpProject,
  IosApp,
} from './types';

type FirebaseApi = firebase_v1beta1.Firebase;
type ResourceManagerApi = cloudresourcemanager_v1.Cloudresourcemanager;

export class FirebaseApiClient {
  private fb: FirebaseApi;
  private rm: ResourceManagerApi;

  constructor(getAccessToken: () => Promise<string>) {
    const auth = new OAuth2Client();
    auth.getAccessToken = async () => ({ token: await getAccessToken() });

    this.fb = firebase({ version: 'v1beta1', auth });
    this.rm = cloudresourcemanager({ version: 'v1', auth });
  }

  async listProjects(): Promise<FirebaseProject[]> {
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
          state: (p.state as 'ACTIVE' | 'DELETED') ?? 'ACTIVE',
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return projects;
  }

  async listAndroidApps(projectId: string): Promise<AndroidApp[]> {
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
  }

  async listIosApps(projectId: string): Promise<IosApp[]> {
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
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return apps;
  }

  async getAndroidConfig(projectId: string, appId: string): Promise<string> {
    const res = await this.fb.projects.androidApps.getConfig({
      name: `projects/${projectId}/androidApps/${appId}/config`,
    });
    return Buffer.from(res.data.configFileContents ?? '', 'base64').toString('utf-8');
  }

  async getIosConfig(projectId: string, appId: string): Promise<string> {
    const res = await this.fb.projects.iosApps.getConfig({
      name: `projects/${projectId}/iosApps/${appId}/config`,
    });
    return Buffer.from(res.data.configFileContents ?? '', 'base64').toString('utf-8');
  }

  async createAndroidApp(projectId: string, request: CreateAndroidAppRequest): Promise<AndroidApp> {
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
    };
  }

  async listGcpProjects(): Promise<GcpProject[]> {
    const projects: GcpProject[] = [];
    let pageToken: string | undefined;

    do {
      const res = await this.rm.projects.list({ pageToken });
      for (const p of res.data.projects ?? []) {
        projects.push({
          projectId: p.projectId ?? '',
          name: p.name ?? '',
          projectNumber: p.projectNumber ?? '',
          lifecycleState: (p.lifecycleState as GcpProject['lifecycleState']) ?? 'ACTIVE',
          createTime: p.createTime ?? undefined,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return projects;
  }

  async listAvailableGcpProjects(): Promise<GcpProject[]> {
    const [gcpProjects, firebaseProjects] = await Promise.all([
      this.listGcpProjects(),
      this.listProjects(),
    ]);
    const firebaseProjectIds = new Set(firebaseProjects.map((p) => p.projectId));
    return gcpProjects.filter(
      (gcp) => gcp.lifecycleState === 'ACTIVE' && !firebaseProjectIds.has(gcp.projectId),
    );
  }

  async addFirebaseToProject(projectId: string): Promise<FirebaseProject> {
    const res = await this.fb.projects.addFirebase({ project: `projects/${projectId}` });
    if (!res.data.name) {
      throw new Error('Failed to add Firebase: no operation name returned');
    }
    const project = await this.waitForOperation<firebase_v1beta1.Schema$FirebaseProject>(
      res.data.name,
    );
    return {
      name: project.name ?? '',
      projectId: project.projectId ?? '',
      projectNumber: project.projectNumber ?? '',
      displayName: project.displayName ?? '',
      state: (project.state as 'ACTIVE' | 'DELETED') ?? 'ACTIVE',
    };
  }

  private async waitForOperation<T>(operationName: string, maxWaitMs = 60000): Promise<T> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const res = await this.fb.operations.get({ name: operationName });
      if (res.data.done) {
        if (res.data.error) {
          throw new Error(`Operation failed: ${res.data.error.message}`);
        }
        return res.data.response as T;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Operation timed out after ${maxWaitMs}ms`);
  }
}
