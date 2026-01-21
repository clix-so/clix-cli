import { getConsoleUrl, getCredentialsManager } from '../auth';
import { AuthError } from '../auth/errors';
import { NetworkError } from '../errors/types';
import type { Member, Organization, Project } from './types';

/**
 * Internal API proxy prefix on Console.
 */
const API_PROXY_PREFIX = '/api/clix/internal';

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
  private baseUrl: string;

  constructor(consoleUrl?: string) {
    this.baseUrl = (consoleUrl ?? getConsoleUrl()) + API_PROXY_PREFIX;
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
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const credentialsManager = getCredentialsManager();
    const token = await credentialsManager.getValidToken();

    if (!token) {
      throw AuthError.notLoggedIn();
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    try {
      const response = await fetch(url, {
        ...options,
        headers,
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
      if (error instanceof AuthError || error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to connect to API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        url,
      );
    }
  }

  /**
   * Get current member information.
   *
   * @returns Current member
   */
  async getMe(): Promise<Member> {
    const response = await this.request<{ member: Member }>('/api/v1/members/me');
    return response.member;
  }

  /**
   * List organizations the current member belongs to.
   *
   * @returns List of organizations
   */
  async listOrganizations(): Promise<Organization[]> {
    const response = await this.request<{ organizations: Organization[] }>('/api/v1/organizations');
    return response.organizations;
  }

  /**
   * List projects in an organization.
   *
   * @param organizationId - Organization ID
   * @returns List of projects
   */
  async listProjects(organizationId: string): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>(
      `/api/v1/organizations/${organizationId}/projects`,
    );
    return response.projects;
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
