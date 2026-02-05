/**
 * Google IAM REST API client.
 *
 * Manages service accounts and keys for Firebase projects.
 *
 * @module services/firebase/api/iam-api
 */

import type {
  CreateServiceAccountKeyRequest,
  CreateServiceAccountRequest,
  ListServiceAccountsResponse,
  ServiceAccount,
  ServiceAccountKey,
} from './types';

const IAM_BASE_URL = 'https://iam.googleapis.com/v1';

/**
 * Google IAM API client.
 *
 * Uses the IAM REST API to manage service accounts and their keys.
 */
export class IamApiClient {
  private getAccessToken: () => Promise<string>;

  /**
   * Create a new IAM API client.
   *
   * @param getAccessToken - Function to get a valid access token
   */
  constructor(getAccessToken: () => Promise<string>) {
    this.getAccessToken = getAccessToken;
  }

  /**
   * Make an authenticated GET request to the IAM API.
   */
  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${IAM_BASE_URL}${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`IAM API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated POST request to the IAM API.
   */
  private async postRequest<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${IAM_BASE_URL}${path}`;

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
      throw new Error(`IAM API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch paginated results from the IAM API.
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
   * List service accounts in a project.
   *
   * @param projectId - GCP project ID
   * @returns List of service accounts
   */
  async listServiceAccounts(projectId: string): Promise<ServiceAccount[]> {
    return this.fetchPaginated<ServiceAccount, ListServiceAccountsResponse>(
      `/projects/${projectId}/serviceAccounts`,
      (response) => response.accounts,
    );
  }

  /**
   * Get a specific service account.
   *
   * @param projectId - GCP project ID
   * @param serviceAccountEmail - Service account email
   * @returns Service account details
   */
  async getServiceAccount(projectId: string, serviceAccountEmail: string): Promise<ServiceAccount> {
    return this.request<ServiceAccount>(
      `/projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
    );
  }

  /**
   * Create a new service account.
   *
   * @param projectId - GCP project ID
   * @param accountId - Service account ID (part before @)
   * @param displayName - Optional display name
   * @param description - Optional description
   * @returns Created service account
   */
  async createServiceAccount(
    projectId: string,
    accountId: string,
    displayName?: string,
    description?: string,
  ): Promise<ServiceAccount> {
    const request: CreateServiceAccountRequest = {
      accountId,
      serviceAccount: {
        displayName,
        description,
      },
    };

    return this.postRequest<ServiceAccount>(`/projects/${projectId}/serviceAccounts`, request);
  }

  /**
   * Create a new key for a service account.
   *
   * The key is returned in the response and cannot be retrieved again.
   * Store it securely.
   *
   * @param projectId - GCP project ID
   * @param serviceAccountEmail - Service account email
   * @returns Service account key with private key data (base64 encoded)
   */
  async createServiceAccountKey(
    projectId: string,
    serviceAccountEmail: string,
  ): Promise<ServiceAccountKey> {
    const request: CreateServiceAccountKeyRequest = {
      privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
      keyAlgorithm: 'KEY_ALG_RSA_2048',
    };

    return this.postRequest<ServiceAccountKey>(
      `/projects/${projectId}/serviceAccounts/${serviceAccountEmail}/keys`,
      request,
    );
  }

  /**
   * Create a service account and generate a key in one operation.
   *
   * This is a convenience method that combines createServiceAccount and createServiceAccountKey.
   *
   * @param projectId - GCP project ID
   * @param accountId - Service account ID (part before @)
   * @param displayName - Optional display name
   * @returns Object containing the service account and its key
   */
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
