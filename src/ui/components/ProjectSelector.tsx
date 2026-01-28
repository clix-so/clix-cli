import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Organization, Project } from '@/lib/api';

interface OrgWithProjects {
  org: Organization;
  projects: Project[];
}

interface FlattenedProject {
  project: Project;
  org: Organization;
}

export interface ProjectSelectorProps {
  organizations: OrgWithProjects[];
  onSelect: (project: Project, org: Organization) => void;
  onSkip: () => void;
  workspacePath: string;
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

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  organizations,
  onSelect,
  onSkip,
  workspacePath,
}) => {
  const flattenedProjects = useMemo(() => flattenProjects(organizations), [organizations]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate visible window for scrolling (show max 10 items)
  const maxVisible = 10;
  const totalItems = flattenedProjects.length;
  const halfWindow = Math.floor(maxVisible / 2);

  // Clamp selectedIndex when list changes
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (totalItems <= 0) return 0;
      if (prev >= totalItems) return totalItems - 1;
      return prev;
    });
  }, [totalItems]);

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

  const visibleProjects = flattenedProjects.slice(startIndex, endIndex);

  useInput((_input, key) => {
    // Handle empty list - only Enter/Esc work
    if (totalItems === 0) {
      if (key.return || key.escape) {
        onSkip();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const selected = flattenedProjects[selectedIndex];
      if (selected) {
        onSelect(selected.project, selected.org);
      }
    } else if (key.escape) {
      onSkip();
    }
  });

  if (flattenedProjects.length === 0) {
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

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold>Select a project to link to this workspace:</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{workspacePath}</Text>
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
        <Text dimColor>↑↓ to navigate · Enter to select · Esc to skip</Text>
      </Box>
    </Box>
  );
};
