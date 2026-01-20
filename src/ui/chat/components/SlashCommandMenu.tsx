import { Box, Text } from 'ink';
import type React from 'react';

import { getCommands } from '@/lib/commands';
import { getAvailableSkills } from '@/lib/skills';

export interface SlashCommand {
  command: string;
  description: string;
  category?: 'skill' | 'system';
}

function buildSkillLookup(): Map<string, { isLocal: boolean }> {
  const skills = getAvailableSkills();
  return new Map(skills.map((s) => [s.type, { isLocal: !!s.isLocal }]));
}

/**
 * Get all slash commands dynamically.
 *
 * Source of truth is the command registry (`src/lib/commands/registry.ts`).
 * This avoids the slash command menu falling out of sync when new commands are added.
 */
export function getSlashCommands(): SlashCommand[] {
  const skillLookup = buildSkillLookup();
  const visibleCommands = getCommands().filter((c) => !c.isHidden);

  const skillCommands: SlashCommand[] = [];
  const systemCommands: SlashCommand[] = [];

  for (const cmd of visibleCommands) {
    const skillInfo = skillLookup.get(cmd.name);
    const isSkill = !!skillInfo && !skillInfo.isLocal;

    const entry: SlashCommand = {
      command: cmd.name,
      description: cmd.description,
      category: isSkill ? 'skill' : 'system',
    };

    if (skillInfo) {
      skillCommands.push(entry);
    } else {
      systemCommands.push(entry);
    }
  }

  return [...skillCommands, ...systemCommands];
}

interface SlashCommandMenuProps {
  filter: string;
  selectedIndex: number;
  visible: boolean;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  filter,
  selectedIndex,
  visible,
}) => {
  if (!visible) return null;

  const allCommands = getSlashCommands();
  const filteredCommands = allCommands.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(filter.toLowerCase()),
  );

  if (filteredCommands.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginX={1}
        marginBottom={1}
      >
        <Text dimColor>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginX={1}
      marginBottom={1}
    >
      {filteredCommands.map((cmd, index) => {
        const isSelected = index === selectedIndex;
        const isSkill = cmd.category === 'skill';

        return (
          <Box key={cmd.command} flexDirection="row">
            <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
              /{cmd.command}
            </Text>
            <Text dimColor> {cmd.description}</Text>
            {isSkill && (
              <Text color="yellow" dimColor>
                {' '}
                [skill]
              </Text>
            )}
          </Box>
        );
      })}
      <Box marginTop={0}>
        <Text dimColor>Tab to complete · Enter to select · Esc to cancel</Text>
      </Box>
    </Box>
  );
};

export function getFilteredCommands(filter: string): SlashCommand[] {
  const allCommands = getSlashCommands();
  return allCommands.filter((cmd) => cmd.command.toLowerCase().startsWith(filter.toLowerCase()));
}
