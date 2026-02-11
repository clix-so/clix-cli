import { getInternalApiClient, type Organization, type Project } from '@/lib/api';
import { getCredentialsManager } from '@/lib/auth';
import { createLogger } from '@/lib/debug/logger';

const projectsLogger = createLogger('projects-fetch');

const DEFAULT_PROJECT_FETCH_CONCURRENCY = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 1;

export interface OrgWithProjects {
  org: Organization;
  projects: Project[];
}

export interface FetchOrganizationsWithProjectsOptions {
  projectFetchConcurrency?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
}

function normalizeConcurrency(input?: number): number {
  if (!input || !Number.isFinite(input) || input <= 0) {
    return DEFAULT_PROJECT_FETCH_CONCURRENCY;
  }
  return Math.floor(input);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapItem: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) return [];

  const normalizedConcurrency = Math.min(concurrency, items.length);
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapItem(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: normalizedConcurrency }, () => worker()));
  return results;
}

export async function fetchOrganizationsWithProjects(
  options: FetchOrganizationsWithProjectsOptions = {},
): Promise<OrgWithProjects[]> {
  const apiClient = getInternalApiClient();
  const credentialsManager = getCredentialsManager();
  const concurrency = normalizeConcurrency(options.projectFetchConcurrency);
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const startedAt = performance.now();

  try {
    const authToken = await credentialsManager.getValidToken();
    if (!authToken) {
      return [];
    }

    const orgFetchStartedAt = performance.now();
    const organizations = await apiClient.listOrganizations({
      authToken,
      timeoutMs,
      maxRetries,
    });
    const orgFetchDurationMs = Math.round(performance.now() - orgFetchStartedAt);

    const projectsFetchStartedAt = performance.now();
    const orgsWithProjects = await mapWithConcurrency(
      organizations,
      concurrency,
      async (org): Promise<OrgWithProjects> => {
        try {
          const projects = await apiClient.listProjects(org.id, {
            authToken,
            timeoutMs,
            maxRetries,
          });
          return { org, projects };
        } catch (error) {
          if (projectsLogger.isEnabled()) {
            projectsLogger.debug('Failed to fetch projects for org', {
              orgId: org.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return { org, projects: [] };
        }
      },
    );
    const projectsFetchDurationMs = Math.round(performance.now() - projectsFetchStartedAt);
    const totalDurationMs = Math.round(performance.now() - startedAt);

    if (projectsLogger.isEnabled()) {
      projectsLogger.debug('Fetched organizations and projects', {
        organizationCount: organizations.length,
        projectCount: orgsWithProjects.reduce((sum, orgData) => sum + orgData.projects.length, 0),
        concurrency,
        timeoutMs,
        maxRetries,
        orgFetchDurationMs,
        projectsFetchDurationMs,
        totalDurationMs,
      });
    }

    return orgsWithProjects;
  } catch (error) {
    if (projectsLogger.isEnabled()) {
      projectsLogger.debug('Failed to fetch organizations and projects', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}
