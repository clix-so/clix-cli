import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { AUTH_ENV_VARS } from '@/lib/auth';
import { InternalApiClient } from '../internal-client';

const originalFetch = globalThis.fetch;
const originalConsoleUrl = process.env[AUTH_ENV_VARS.CONSOLE_URL];
const originalManagementApiUrl = process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('InternalApiClient', () => {
  const requests: string[] = [];

  beforeEach(() => {
    requests.length = 0;
    delete process.env[AUTH_ENV_VARS.CONSOLE_URL];
    delete process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL];

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith('/api/v1/members/me')) {
        return jsonResponse({
          member: {
            id: 'member-1',
            auth_provider_id: 'auth0|1',
            email: 'user@example.com',
            name: 'User',
          },
        });
      }

      if (url.endsWith('/api/v1/organizations')) {
        return jsonResponse({ organizations: [{ id: 'org-1', name: 'Org 1' }] });
      }

      if (url.endsWith('/api/v1/organizations/org-1/projects')) {
        return jsonResponse({
          projects: [{ id: 'project-1', organization_id: 'org-1', name: 'Project 1' }],
        });
      }

      if (url.endsWith('/api/v1/projects/project-1')) {
        return jsonResponse({
          project: { id: 'project-1', organization_id: 'org-1', name: 'Project 1' },
        });
      }

      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalConsoleUrl === undefined) {
      delete process.env[AUTH_ENV_VARS.CONSOLE_URL];
    } else {
      process.env[AUTH_ENV_VARS.CONSOLE_URL] = originalConsoleUrl;
    }

    if (originalManagementApiUrl === undefined) {
      delete process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL];
    } else {
      process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL] = originalManagementApiUrl;
    }

    globalThis.fetch = originalFetch;
  });

  test('uses the production management API by default', async () => {
    const client = new InternalApiClient();

    await client.getMe({ authToken: 'token-1' });

    expect(requests).toEqual(['https://management-api.clix.so/api/v1/members/me']);
  });

  test('derives management reads from the console override', async () => {
    process.env[AUTH_ENV_VARS.CONSOLE_URL] = 'http://localhost:3000';
    const client = new InternalApiClient();

    await client.getMe({ authToken: 'token-1' });

    expect(requests).toEqual(['http://localhost:3000/api/clix/management/api/v1/members/me']);
  });

  test('uses the explicit management API override when configured', async () => {
    process.env[AUTH_ENV_VARS.CONSOLE_URL] = 'http://localhost:3000';
    process.env[AUTH_ENV_VARS.MANAGEMENT_API_URL] = 'https://management.example';
    const client = new InternalApiClient();

    await client.getMe({ authToken: 'token-1' });

    expect(requests).toEqual(['https://management.example/api/v1/members/me']);
  });

  test('reads member, organizations, and org projects from management-api', async () => {
    const client = new InternalApiClient('https://console.example', 'https://management.example');

    await client.getMe({ authToken: 'token-1' });
    await client.listOrganizations({ authToken: 'token-1' });
    await client.listProjects('org-1', { authToken: 'token-1' });

    expect(requests).toEqual([
      'https://management.example/api/v1/members/me',
      'https://management.example/api/v1/organizations',
      'https://management.example/api/v1/organizations/org-1/projects',
    ]);
  });

  test('keeps runtime project reads on the console internal proxy', async () => {
    const client = new InternalApiClient('https://console.example', 'https://management.example');

    await client.getProject('project-1', { authToken: 'token-1' });

    expect(requests).toEqual([
      'https://console.example/api/clix/internal/api/v1/projects/project-1',
    ]);
  });
});
