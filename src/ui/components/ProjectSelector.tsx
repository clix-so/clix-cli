import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Organization, Project } from '@/lib/api';

export interface OrgWithProjects {
  org: Organization;
  projects: Project[];
}

export interface FlattenedProject {
  project: Project;
  org: Organization;
}

const PROJECT_SORTER: Intl.Collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export interface ProjectSelectorProps {
  organizations: OrgWithProjects[];
  onSelect: (project: Project, org: Organization) => void;
  onSkip: () => void;
  workspacePath: string;
  /** Whether to show skip option (default: true) */
  showSkip?: boolean;
}

/**
 * Flatten organizations and projects into a single list for selection.
 */
function flattenProjects(organizations: OrgWithProjects[]): FlattenedProject[] {
  const flattened: FlattenedProject[] = [];
  for (const { org, projects } of organizations) {
    for (const project of projects) {
      flattened.push({ project, org });
    }
  }
  return flattened;
}

function compareProjectsAsc(a: FlattenedProject, b: FlattenedProject): number {
  const byProjectName = PROJECT_SORTER.compare(a.project.name, b.project.name);
  if (byProjectName !== 0) return byProjectName;

  const byOrgName = PROJECT_SORTER.compare(a.org.name, b.org.name);
  if (byOrgName !== 0) return byOrgName;

  return PROJECT_SORTER.compare(a.project.id, b.project.id);
}

export function getSortedProjects(organizations: OrgWithProjects[]): FlattenedProject[] {
  return flattenProjects(organizations).sort(compareProjectsAsc);
}

export function filterProjectsByQuery(
  projects: FlattenedProject[],
  query: string,
): FlattenedProject[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return projects;

  return projects.filter((item) => item.project.name.toLowerCase().includes(normalizedQuery));
}

function applySearchInput(
  input: string,
  key: { backspace?: boolean; delete?: boolean; space?: boolean },
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>,
): boolean {
  if (key.backspace || key.delete) {
    setSearchQuery((prev) => prev.slice(0, -1));
    return true;
  }
  if (key.space) {
    setSearchQuery((prev) => `${prev} `);
    return true;
  }
  if (input && !input.startsWith('\u001b')) {
    setSearchQuery((prev) => `${prev}${input}`);
    return true;
  }
  return false;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  organizations,
  onSelect,
  onSkip,
  workspacePath,
  showSkip = true,
}) => {
  const sortedProjects = useMemo(() => getSortedProjects(organizations), [organizations]);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredProjects = useMemo(
    () => filterProjectsByQuery(sortedProjects, searchQuery),
    [sortedProjects, searchQuery],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate visible window for scrolling (show max 10 items)
  const maxVisible = 10;
  const totalItems = filteredProjects.length;
  const halfWindow = Math.floor(maxVisible / 2);

  let startIndex = 0;
  let endIndex = maxVisible;

  if (totalItems > maxVisible) {
    if (selectedIndex < halfWindow) {
      startIndex = 0;
      endIndex = maxVisible;
    } else if (selectedIndex >= totalItems - halfWindow) {
      startIndex = totalItems - maxVisible;
      endIndex = totalItems;
    } else {
      startIndex = selectedIndex - halfWindow;
      endIndex = startIndex + maxVisible;
    }
  } else {
    endIndex = totalItems;
  }

  const visibleProjects = filteredProjects.slice(startIndex, endIndex);

  useInput((input, key) => {
    // Handle empty state differently for no projects vs no search matches.
    if (totalItems === 0) {
      if (sortedProjects.length === 0 && (key.return || (showSkip && key.escape))) {
        onSkip();
        return;
      }
      if (showSkip && key.escape) {
        onSkip();
        return;
      }
      applySearchInput(input, key, setSearchQuery);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      return;
    }
    if (key.return) {
      const selected = filteredProjects[selectedIndex];
      if (selected) {
        onSelect(selected.project, selected.org);
      }
      return;
    }
    if (showSkip && key.escape) {
      onSkip();
      return;
    }
    applySearchInput(input, key, setSearchQuery);
  });

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (totalItems <= 0) return 0;
      if (prev >= totalItems) return 0;
      return prev;
    });
  }, [totalItems]);

  if (sortedProjects.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>No projects available to link.</Text>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="gray">Enter</Text>
          <Text dimColor> to continue</Text>
        </Box>
      </Box>
    );
  }

  if (filteredProjects.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text bold>Select a project to link to this workspace:</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>{workspacePath}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Search: </Text>
          <Text color="cyan">{searchQuery || '(type to search)'}</Text>
        </Box>
        <Text dimColor>No matching projects found.</Text>
        <Box marginTop={1}>
          <Text dimColor>
            Type to search · Backspace to clear{showSkip ? ' · Esc to skip' : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold>Select a project to link to this workspace:</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{workspacePath}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Search: </Text>
        <Text color="cyan">{searchQuery || '(type to search)'}</Text>
      </Box>

      {startIndex > 0 && (
        <Box>
          <Text dimColor> ↑ {startIndex} more...</Text>
        </Box>
      )}

      {visibleProjects.map((item, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === selectedIndex;
        return (
          <Box key={`${item.org.id}-${item.project.id}`} flexDirection="row">
            <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
              {item.project.name}
            </Text>
            <Text dimColor> ({item.org.name})</Text>
          </Box>
        );
      })}

      {endIndex < totalItems && (
        <Box>
          <Text dimColor> ↓ {totalItems - endIndex} more...</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Type to search · ↑↓ to navigate · Enter to select{showSkip ? ' · Esc to skip' : ''}
        </Text>
      </Box>
    </Box>
  );
};
