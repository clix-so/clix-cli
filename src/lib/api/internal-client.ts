import { AUTH_ENV_VARS, DEFAULT_CONSOLE_URL, getConsoleUrl, getCredentialsManager } from '../auth';
import { AuthError } from '../auth/errors';
import { NetworkError } from '../errors/types';
import type { Member, Organization, Project, SenderConfig } from './types';

const INTERNAL_API_PROXY_PREFIX = '/api/clix/internal';
const DEFAULT_MANAGEMENT_API_URL = 'https://management-api.clix.so';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface InternalApiRequestOptions {
  authToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Internal API client that communicates through Console's proxy endpoint.
 *
 * The Console proxy handles:
 * - Adding Cloudflare Access token (cf-access-token)
 * - Forwarding requests to Internal API
 *
 * @example
 * ```typescript
 * const client = new InternalApiClient();
 * const me = await client.getMe();
 * console.log(`Logged in as ${me.email}`);
 * ```
 */
export class InternalApiClient {
  private internalBaseUrl: string;
  private managementBaseUrl: string;

  constructor(consoleUrl?: string, managementApiUrl?: string) {
    const resolvedConsoleUrl = (consoleUrl ?? getConsoleUrl()).replace(/\/+$/, '');

    this.internalBaseUrl = resolvedConsoleUrl + INTERNAL_API_PROXY_PREFIX;
    this.managementBaseUrl =
      managementApiUrl ??
      process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL] ??
      (resolvedConsoleUrl === DEFAULT_CONSOLE_URL
        ? DEFAULT_MANAGEMENT_API_URL
        : `${resolvedConsoleUrl}/api/clix/management`);
  }

  private async resolveAccessToken(authToken?: string): Promise<string> {
    if (authToken) return authToken;

    const credentialsManager = getCredentialsManager();
    const token = await credentialsManager.getValidToken();
    if (!token) {
      throw AuthError.notLoggedIn();
    }
    return token;
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof NetworkError)) return false;
    if (error.statusCode === 429) return true;
    if (typeof error.statusCode === 'number' && error.statusCode >= 500) return true;
    return error.statusCode === undefined;
  }

  /**
   * Make an authenticated request to Internal API.
   *
   * @param endpoint - API endpoint (e.g., '/api/v1/members/me')
   * @param options - Fetch options
   * @returns Parsed JSON response
   * @throws AuthError if not authenticated
   * @throws NetworkError if request fails
   */
  private async request<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {},
    requestOptions: InternalApiRequestOptions = {},
  ): Promise<T> {
    const token = await this.resolveAccessToken(requestOptions.authToken);
    const timeoutMs = requestOptions.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const maxRetries = requestOptions.maxRetries ?? 0;
    const url = `${baseUrl}${endpoint}`;
    let attempt = 0;

    while (true) {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('Content-Type', 'application/json');

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw AuthError.tokenExpired();
          }

          const errorText = await response.text().catch(() => '');
          throw new NetworkError(
            `API request failed: ${response.status} ${errorText}`,
            url,
            response.status,
          );
        }

        return response.json() as Promise<T>;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }

        const normalizedError =
          error instanceof NetworkError
            ? error
            : new NetworkError(
                `Failed to connect to API: ${error instanceof Error ? error.message : 'Unknown error'}`,
                url,
              );

        if (attempt >= maxRetries || !this.shouldRetry(normalizedError)) {
          throw normalizedError;
        }

        attempt += 1;
        const backoffMs = 150 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Get current member information.
   *
   * @returns Current member
   */
  async getMe(options?: InternalApiRequestOptions): Promise<Member> {
    const response = await this.request<{ member: Member }>(
      this.managementBaseUrl,
      '/api/v1/members/me',
      {},
      options,
    );
    return response.member;
  }

  /**
   * List organizations the current member belongs to.
   *
   * @returns List of organizations
   */
  async listOrganizations(options?: InternalApiRequestOptions): Promise<Organization[]> {
    const response = await this.request<{ organizations: Organization[] }>(
      this.managementBaseUrl,
      '/api/v1/organizations',
      {},
      options,
    );
    return response.organizations;
  }

  /**
   * List projects in an organization.
   *
   * @param organizationId - Organization ID
   * @returns List of projects
   */
  async listProjects(
    organizationId: string,
    options?: InternalApiRequestOptions,
  ): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>(
      this.managementBaseUrl,
      `/api/v1/organizations/${organizationId}/projects`,
      {},
      options,
    );
    return response.projects;
  }

  /**
   * Get project details including sender configs.
   *
   * @param projectId - Project ID
   * @returns Project with sender_configs
   */
  async getProject(projectId: string, options?: InternalApiRequestOptions): Promise<Project> {
    const response = await this.request<{ project: Project }>(
      this.internalBaseUrl,
      `/api/v1/projects/${projectId}`,
      {},
      options,
    );
    return response.project;
  }

  /**
   * Create or update sender config for push notifications.
   *
   * @param projectId - Project ID
   * @param senderConfig - Sender configuration
   * @returns Updated sender config
   */
  async createOrUpdateSenderConfig(
    projectId: string,
    senderConfig: SenderConfig,
    options?: InternalApiRequestOptions,
  ): Promise<SenderConfig> {
    const response = await this.request<{ sender_config: SenderConfig }>(
      this.internalBaseUrl,
      `/api/v1/projects/${projectId}/sender-configs`,
      {
        method: 'POST',
        body: JSON.stringify({ sender_config: senderConfig }),
      },
      options,
    );
    return response.sender_config;
  }
}

/**
 * Singleton instance for the default Internal API client.
 */
let defaultClient: InternalApiClient | null = null;

/**
 * Get the default InternalApiClient instance.
 */
export function getInternalApiClient(): InternalApiClient {
  if (!defaultClient) {
    defaultClient = new InternalApiClient();
  }
  return defaultClient;
}

/**
 * Reset the default InternalApiClient instance (useful for testing).
 */
export function resetInternalApiClient(): void {
  defaultClient = null;
}
