import { describe, expect, test } from 'bun:test';
import type { Organization, Project } from '@/lib/api';
import {
  filterProjectsByQuery,
  getProjectSelectorMaxVisible,
  getSortedProjects,
  type OrgWithProjects,
} from '../ProjectSelector';

function createOrganization(id: string, name: string): Organization {
  return { id, name };
}

function createProject(id: string, name: string, organizationId: string): Project {
  return { id, name, organization_id: organizationId };
}

describe('ProjectSelector helpers', () => {
  test('sorts projects by project name, then organization name, then project id', () => {
    const organizations: OrgWithProjects[] = [
      {
        org: createOrganization('org-2', 'Beta Org'),
        projects: [
          createProject('p-2', 'zeta', 'org-2'),
          createProject('p-4', 'alpha', 'org-2'),
          createProject('p-6', 'Same Name', 'org-2'),
        ],
      },
      {
        org: createOrganization('org-1', 'Alpha Org'),
        projects: [
          createProject('p-1', 'Alpha', 'org-1'),
          createProject('p-3', 'beta', 'org-1'),
          createProject('p-5', 'Same Name', 'org-1'),
        ],
      },
      {
        org: createOrganization('org-3', 'Alpha Org'),
        projects: [createProject('p-0', 'Same Name', 'org-3')],
      },
    ];

    const sorted = getSortedProjects(organizations);
    const sortedNames = sorted.map(
      (item) => `${item.project.name}::${item.org.name}::${item.project.id}`,
    );

    expect(sortedNames).toEqual([
      'Alpha::Alpha Org::p-1',
      'alpha::Beta Org::p-4',
      'beta::Alpha Org::p-3',
      'Same Name::Alpha Org::p-0',
      'Same Name::Alpha Org::p-5',
      'Same Name::Beta Org::p-6',
      'zeta::Beta Org::p-2',
    ]);
  });

  test('filters by partial project name match (case-insensitive)', () => {
    const organizations: OrgWithProjects[] = [
      {
        org: createOrganization('org-1', 'Alpha Org'),
        projects: [
          createProject('p-1', 'Marketing Mobile', 'org-1'),
          createProject('p-2', 'Core SDK', 'org-1'),
          createProject('p-3', 'QA Testbed', 'org-1'),
        ],
      },
    ];

    const sorted = getSortedProjects(organizations);

    expect(filterProjectsByQuery(sorted, 'ket').map((item) => item.project.name)).toEqual([
      'Marketing Mobile',
    ]);
    expect(filterProjectsByQuery(sorted, 'SDK').map((item) => item.project.name)).toEqual([
      'Core SDK',
    ]);
  });

  test('returns all projects when query is empty or whitespace', () => {
    const organizations: OrgWithProjects[] = [
      {
        org: createOrganization('org-1', 'Alpha Org'),
        projects: [createProject('p-1', 'One', 'org-1'), createProject('p-2', 'Two', 'org-1')],
      },
    ];

    const sorted = getSortedProjects(organizations);

    expect(filterProjectsByQuery(sorted, '').length).toBe(2);
    expect(filterProjectsByQuery(sorted, '   ').length).toBe(2);
  });

  test('uses compact visible item count for small terminals', () => {
    expect(getProjectSelectorMaxVisible(30)).toBe(5);
    expect(getProjectSelectorMaxVisible(34)).toBe(5);
  });

  test('uses medium visible item count for medium terminals', () => {
    expect(getProjectSelectorMaxVisible(35)).toBe(7);
    expect(getProjectSelectorMaxVisible(42)).toBe(7);
  });

  test('uses large visible item count for large terminals', () => {
    expect(getProjectSelectorMaxVisible(43)).toBe(10);
    expect(getProjectSelectorMaxVisible(60)).toBe(10);
  });
});
