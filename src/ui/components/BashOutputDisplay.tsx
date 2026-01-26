/**
 * Bash output display component.
 *
 * Displays bash command execution results in the chat interface.
 */
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { memo } from 'react';

interface BashOutputDisplayProps {
  /** The command that was executed */
  command: string;
  /** Output from the command (stdout + stderr) */
  output: string;
  /** Exit code, null if process was killed */
  exitCode?: number | null;
  /** Execution status */
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  /** Whether output was truncated */
  truncated?: boolean;
}

const BashOutputDisplayInternal: React.FC<BashOutputDisplayProps> = ({
  command,
  output,
  exitCode,
  status = 'complete',
  truncated = false,
}) => {
  const isLoading = status === 'pending' || status === 'streaming';
  const isComplete = status === 'complete';
  const isError = status === 'error';

  return (
    <Box flexDirection="column" marginY={0} paddingX={1} marginLeft={2}>
      {/* Command line */}
      <Box>
        <Text dimColor>
          <Text color="cyan">[Bash] </Text>
          {isLoading && (
            <Text color="yellow">
              <Spinner type="dots" />{' '}
            </Text>
          )}
          {isComplete && <Text color="green">✓ </Text>}
          {isError && <Text color="red">✗ </Text>}
          <Text>$ {command}</Text>
        </Text>
      </Box>

      {/* Output */}
      {output && (
        <Box marginLeft={2} flexDirection="column">
          <Text dimColor>{output}</Text>
        </Box>
      )}

      {/* Truncation notice */}
      {truncated && (
        <Box marginLeft={2}>
          <Text dimColor italic>
            (output truncated)
          </Text>
        </Box>
      )}

      {/* Exit code (only show when complete and non-zero, or error) */}
      {!isLoading && exitCode !== 0 && exitCode !== undefined && (
        <Box marginLeft={2}>
          <Text dimColor>
            Exit code: <Text color={exitCode === 0 ? 'green' : 'red'}>{exitCode ?? 'killed'}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
};

export const BashOutputDisplay = memo(BashOutputDisplayInternal);
