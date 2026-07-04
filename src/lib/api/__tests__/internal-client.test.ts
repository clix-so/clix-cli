import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { InternalApiClient } from '../internal-client';

const originalFetch = globalThis.fetch;

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
    globalThis.fetch = originalFetch;
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
