import { Box, Text, useInput } from 'ink';
import React from 'react';
import {
  getMCPAgentConfigs,
  type MCPAgentConfig,
  type MCPTargetAgent,
} from '../../lib/services/mcp-install-service';

interface MCPInstallSelectorProps {
  selectedIndex?: number;
  onSelect: (agent: MCPTargetAgent) => void;
  onCancel?: () => void;
  onNavigate?: (direction: 'up' | 'down') => void;
}

export const MCPInstallSelector: React.FC<MCPInstallSelectorProps> = ({
  selectedIndex: controlledIndex,
  onSelect,
  onCancel,
  onNavigate,
}) => {
  const agents = getMCPAgentConfigs();
  const [internalIndex, setInternalIndex] = React.useState(0);

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
        onSelect(selected.name);
      }
    } else if (key.escape && onCancel) {
      onCancel();
    }
  });

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
        <Text bold>Install Clix MCP Server</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Select the AI agent to configure:</Text>
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
        <Text dimColor>↑↓ to navigate · Enter to install · Esc to cancel</Text>
      </Box>
    </Box>
  );
};

// Export for external use
export { getMCPAgentConfigs, type MCPAgentConfig };
