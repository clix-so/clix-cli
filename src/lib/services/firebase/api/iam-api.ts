/**
 * Google IAM API client using @googleapis/iam.
 *
 * @module services/firebase/api/iam-api
 */

import { iam, type iam_v1 } from '@googleapis/iam';
import { OAuth2Client } from 'google-auth-library';
import type { ServiceAccount, ServiceAccountKey } from './types';

type IamApi = iam_v1.Iam;

export class IamApiClient {
  private api: IamApi;

  constructor(getAccessToken: () => Promise<string>) {
    const auth = new OAuth2Client();
    auth.getAccessToken = async () => ({ token: await getAccessToken() });

    this.api = iam({ version: 'v1', auth });
  }

  async listServiceAccounts(projectId: string): Promise<ServiceAccount[]> {
    const accounts: ServiceAccount[] = [];
    let pageToken: string | undefined;

    do {
      const res = await this.api.projects.serviceAccounts.list({
        name: `projects/${projectId}`,
        pageToken,
      });
      for (const sa of res.data.accounts ?? []) {
        accounts.push({
          name: sa.name ?? '',
          projectId: sa.projectId ?? projectId,
          uniqueId: sa.uniqueId ?? '',
          email: sa.email ?? '',
          displayName: sa.displayName ?? undefined,
          description: sa.description ?? undefined,
          disabled: sa.disabled ?? false,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return accounts;
  }

  async getServiceAccount(projectId: string, serviceAccountEmail: string): Promise<ServiceAccount> {
    const res = await this.api.projects.serviceAccounts.get({
      name: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
    });
    const sa = res.data;
    return {
      name: sa.name ?? '',
      projectId: sa.projectId ?? projectId,
      uniqueId: sa.uniqueId ?? '',
      email: sa.email ?? '',
      displayName: sa.displayName ?? undefined,
      description: sa.description ?? undefined,
      disabled: sa.disabled ?? false,
    };
  }

  async createServiceAccount(
    projectId: string,
    accountId: string,
    displayName?: string,
    description?: string,
  ): Promise<ServiceAccount> {
    const res = await this.api.projects.serviceAccounts.create({
      name: `projects/${projectId}`,
      requestBody: {
        accountId,
        serviceAccount: { displayName, description },
      },
    });
    const sa = res.data;
    return {
      name: sa.name ?? '',
      projectId: sa.projectId ?? projectId,
      uniqueId: sa.uniqueId ?? '',
      email: sa.email ?? '',
      displayName: sa.displayName ?? undefined,
      description: sa.description ?? undefined,
      disabled: sa.disabled ?? false,
    };
  }

  async createServiceAccountKey(
    projectId: string,
    serviceAccountEmail: string,
  ): Promise<ServiceAccountKey> {
    const res = await this.api.projects.serviceAccounts.keys.create({
      name: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
      requestBody: {
        privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
        keyAlgorithm: 'KEY_ALG_RSA_2048',
      },
    });
    const key = res.data;
    return {
      name: key.name ?? '',
      privateKeyType: key.privateKeyType ?? '',
      keyAlgorithm: key.keyAlgorithm ?? '',
      privateKeyData: key.privateKeyData ?? '',
      validAfterTime: key.validAfterTime ?? '',
      validBeforeTime: key.validBeforeTime ?? '',
    };
  }

  async createServiceAccountWithKey(
    projectId: string,
    accountId: string,
    displayName?: string,
  ): Promise<{ serviceAccount: ServiceAccount; key: ServiceAccountKey }> {
    const serviceAccount = await this.createServiceAccount(
      projectId,
      accountId,
      displayName,
      'Created by Clix CLI for Firebase Admin SDK',
    );
    const key = await this.createServiceAccountKey(projectId, serviceAccount.email);
    return { serviceAccount, key };
  }
}
