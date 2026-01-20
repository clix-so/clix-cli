import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import type { AgentInfo } from '../../lib/agents';
import { SUPPORTED_AGENTS } from '../../lib/agents';

interface AgentSelectorProps {
  agents: AgentInfo[];
  onSelect: (agent: AgentInfo) => void;
  // Optional props for controlled mode (used in ChatApp)
  currentAgent?: AgentInfo | null;
  selectedIndex?: number;
  onCancel?: () => void;
  onNavigate?: (direction: 'up' | 'down') => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  onSelect,
  currentAgent,
  selectedIndex: controlledIndex,
  onCancel,
  onNavigate,
}) => {
  // Internal state for standalone mode
  const [internalIndex, setInternalIndex] = useState(0);

  // Use controlled index if provided, otherwise use internal state
  const isControlled = controlledIndex !== undefined && onNavigate !== undefined;
  const selectedIndex = isControlled ? controlledIndex : internalIndex;

  useInput((_input, key) => {
    if (key.upArrow) {
      if (isControlled) {
        onNavigate?.('up');
      } else {
        setInternalIndex((prev) => (prev > 0 ? prev - 1 : agents.length - 1));
      }
    } else if (key.downArrow) {
      if (isControlled) {
        onNavigate?.('down');
      } else {
        setInternalIndex((prev) => (prev < agents.length - 1 ? prev + 1 : 0));
      }
    } else if (key.return) {
      const selected = agents[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
    } else if (key.escape && onCancel) {
      onCancel();
    }
  });

  // No agents available
  if (agents.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2} marginY={1}>
        <Text dimColor>No agents installed.</Text>
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

  // Controlled mode (with border, used in ChatApp)
  if (isControlled) {
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
          <Text bold>Select Agent</Text>
        </Box>
        {agents.map((agent, index) => {
          const isSelected = index === selectedIndex;
          const isCurrent = agent.name === currentAgent?.name;

          return (
            <Box key={agent.name} flexDirection="row">
              <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
              <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
                {agent.displayName}
              </Text>
              {isCurrent && <Text color="green"> (current)</Text>}
              <Text dimColor> {agent.description}</Text>
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to select · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Standalone mode (used in chat.tsx for initial selection)
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select an AI Agent
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
      </Box>

      <Box flexDirection="column">
        {agents.map((agent, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={agent.name}>
              <Text color={isSelected ? 'green' : undefined}>
                {isSelected ? '❯ ' : '  '}
                {agent.displayName}
              </Text>
              {isSelected && <Text dimColor> - {agent.description}</Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
