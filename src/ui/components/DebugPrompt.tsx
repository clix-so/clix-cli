import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useState } from 'react';
import { useCancelInput } from '@/ui/hooks';

interface DebugPromptProps {
  onSubmit: (description: string) => void;
  onCancel: () => void;
}

export const DebugPrompt: React.FC<DebugPromptProps> = ({ onSubmit, onCancel }) => {
  const [value, setValue] = useState('');

  useCancelInput(onCancel);

  const handleSubmit = (submittedValue: string) => {
    if (submittedValue.trim()) {
      onSubmit(submittedValue.trim());
      setValue('');
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Debug Assistant
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Describe the problem you're experiencing:</Text>
      </Box>
      <Box marginBottom={1} marginLeft={1}>
        <Text color="blue">{'> '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="e.g., Push notifications not working on iOS..."
        />
      </Box>
      <Box marginTop={0}>
        <Text dimColor>Enter to submit · Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
};
