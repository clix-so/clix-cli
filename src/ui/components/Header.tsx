import { Box, Text } from 'ink';
import type React from 'react';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <Box flexDirection="column" marginBottom={2}>
      <Text bold>{title}</Text>
    </Box>
  );
};
