import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { AgentInfo } from '../../lib/agents';
import { SUPPORTED_AGENTS } from '../../lib/agents';

interface TransferSelectorProps {
  agents: AgentInfo[];
  selectedIndex: number;
  onSelect: (agent: AgentInfo) => void;
  onCancel: () => void;
  onNavigate: (direction: 'up' | 'down') => void;
}

export const TransferSelector: React.FC<TransferSelectorProps> = ({
  agents,
  selectedIndex,
  onSelect,
  onCancel,
  onNavigate,
}) => {
  useInput((_input, key) => {
    if (key.upArrow) {
      onNavigate('up');
    } else if (key.downArrow) {
      onNavigate('down');
    } else if (key.return) {
      const selected = agents[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  if (agents.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Text dimColor>No transferable agents installed.</Text>
        <Text dimColor>Install one of the following:</Text>
        {SUPPORTED_AGENTS.map((agent) => (
          <Text key={agent.name}>
            {' '}
            - {agent.displayName}: {agent.installUrl}
          </Text>
        ))}
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
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Transfer to Agent CLI</Text>
      </Box>
      {agents.map((agent, index) => {
        const isSelected = index === selectedIndex;

        return (
          <Box key={agent.name} flexDirection="row">
            <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
              {agent.displayName}
            </Text>
            <Text dimColor> {agent.description}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate · Enter to transfer · Esc to cancel</Text>
      </Box>
    </Box>
  );
};
