import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Organization, Project } from '@/lib/api';

const listOrganizationsMock = mock(async (_options?: unknown): Promise<Organization[]> => []);
const listProjectsMock = mock(async (_orgId: string, _options?: unknown): Promise<Project[]> => []);
const getValidTokenMock = mock(async (): Promise<string | null> => 'token-1');

mock.module('@/lib/api', () => ({
  getInternalApiClient: () => ({
    listOrganizations: listOrganizationsMock,
    listProjects: listProjectsMock,
  }),
}));

mock.module('@/lib/auth', () => ({
  getCredentialsManager: () => ({
    getValidToken: getValidTokenMock,
  }),
}));

import { fetchOrganizationsWithProjects } from '../organization-projects';

function org(id: string, name: string): Organization {
  return { id, name };
}

function project(id: string, name: string, organizationId: string): Project {
  return { id, name, organization_id: organizationId };
}

describe('fetchOrganizationsWithProjects', () => {
  beforeEach(() => {
    listOrganizationsMock.mockReset();
    listProjectsMock.mockReset();
    getValidTokenMock.mockReset();
    getValidTokenMock.mockResolvedValue('token-1');
  });

  test('returns empty list when token is unavailable', async () => {
    getValidTokenMock.mockResolvedValue(null);

    const result = await fetchOrganizationsWithProjects();

    expect(result).toEqual([]);
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  test('passes timeout/retry/auth options to api client', async () => {
    listOrganizationsMock.mockResolvedValue([org('o1', 'Org 1')]);
    listProjectsMock.mockResolvedValue([project('p1', 'Project 1', 'o1')]);

    const result = await fetchOrganizationsWithProjects({
      requestTimeoutMs: 4500,
      maxRetries: 2,
      projectFetchConcurrency: 3,
    });

    expect(result).toHaveLength(1);
    expect(listOrganizationsMock).toHaveBeenCalledTimes(1);
    expect(listProjectsMock).toHaveBeenCalledTimes(1);

    const orgCallOptions = listOrganizationsMock.mock.calls[0]?.[0] as {
      authToken: string;
      timeoutMs: number;
      maxRetries: number;
    };
    expect(orgCallOptions.authToken).toBe('token-1');
    expect(orgCallOptions.timeoutMs).toBe(4500);
    expect(orgCallOptions.maxRetries).toBe(2);

    const projectCallOptions = listProjectsMock.mock.calls[0]?.[1] as {
      authToken: string;
      timeoutMs: number;
      maxRetries: number;
    };
    expect(projectCallOptions.authToken).toBe('token-1');
    expect(projectCallOptions.timeoutMs).toBe(4500);
    expect(projectCallOptions.maxRetries).toBe(2);
  });

  test('limits concurrent project fetches and tolerates per-org failure', async () => {
    listOrganizationsMock.mockResolvedValue([
      org('o1', 'Org 1'),
      org('o2', 'Org 2'),
      org('o3', 'Org 3'),
      org('o4', 'Org 4'),
    ]);

    let inFlight = 0;
    let maxInFlight = 0;

    listProjectsMock.mockImplementation(async (organizationId: string): Promise<Project[]> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;

      if (organizationId === 'o3') {
        throw new Error('temporary failure');
      }

      return [project(`p-${organizationId}`, `Project ${organizationId}`, organizationId)];
    });

    const result = await fetchOrganizationsWithProjects({ projectFetchConcurrency: 2 });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(result).toHaveLength(4);

    const failedOrg = result.find((item) => item.org.id === 'o3');
    expect(failedOrg?.projects).toEqual([]);
  });
});
