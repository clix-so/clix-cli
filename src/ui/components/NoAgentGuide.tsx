import { Box, Text } from 'ink';
import React from 'react';
import { SUPPORTED_AGENTS } from '../../lib/agents';
import { Header } from './Header';

interface NoAgentGuideProps {
  onExit?: () => void;
}

export const NoAgentGuide: React.FC<NoAgentGuideProps> = ({ onExit }) => {
  React.useEffect(() => {
    if (onExit) {
      const timer = setTimeout(() => {
        onExit();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [onExit]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="No AI Coding Agent Found" />

      <Box marginTop={1} marginBottom={1}>
        <Text color="yellow">No supported AI coding agent is installed on your system.</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Please install one of the following agents:</Text>
      </Box>

      {SUPPORTED_AGENTS.map((agent) => (
        <Box key={agent.name} flexDirection="column" marginBottom={1} marginLeft={2}>
          <Box>
            <Text bold color="blue">
              {agent.displayName}
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text dimColor>Install: </Text>
            <Text color="blue" underline>
              {agent.installUrl}
            </Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>After installation, run 'clix' again to get started.</Text>
      </Box>
    </Box>
  );
};
