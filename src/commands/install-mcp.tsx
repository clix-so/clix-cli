import { Box, render, Text } from 'ink';
import React, { useCallback, useState } from 'react';
import {
  getMCPAgentDisplayName,
  installMCPServer,
  type MCPTargetAgent,
} from '../lib/services/mcp-install-service';
import { MCPInstallSelector } from '../ui/components/MCPInstallSelector';
import { StatusMessage } from '../ui/components/StatusMessage';
import { type FinalOutputResult, printFinalOutput } from '../ui/utils/finalOutput';

interface InstallMCPCommandOptions {
  agent?: MCPTargetAgent;
}

interface MCPInstallUIProps {
  targetAgent?: MCPTargetAgent;
  onComplete: (result?: FinalOutputResult) => void;
}

const MCPInstallUI: React.FC<MCPInstallUIProps> = ({ targetAgent, onComplete }) => {
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    error?: string;
  } | null>(null);

  const handleSelect = useCallback(
    async (agent: MCPTargetAgent) => {
      setInstalling(true);
      const installResult = await installMCPServer(agent);
      setResult(installResult);
      setInstalling(false);

      setTimeout(() => {
        const finalResult: FinalOutputResult = {
          type: installResult.success ? 'success' : 'error',
          title: installResult.success
            ? 'MCP Server installation completed'
            : 'MCP Server installation failed',
          message: installResult.message,
          details: installResult.error ? [installResult.error] : undefined,
        };
        onComplete(finalResult);
      }, 2000);
    },
    [onComplete],
  );

  // If target agent is specified, install directly
  React.useEffect(() => {
    if (targetAgent) {
      handleSelect(targetAgent);
    }
  }, [targetAgent, handleSelect]);

  if (targetAgent) {
    // Direct installation mode
    return (
      <Box flexDirection="column" padding={1}>
        {installing && (
          <StatusMessage
            type="loading"
            message={`Installing Clix MCP Server for ${getMCPAgentDisplayName(targetAgent)}...`}
          />
        )}
        {result &&
          (result.success ? (
            <StatusMessage type="success" message={result.message} />
          ) : (
            <Box flexDirection="column">
              <StatusMessage type="error" message={result.message} />
              {result.error && <Text dimColor>{result.error}</Text>}
            </Box>
          ))}
      </Box>
    );
  }

  // Interactive selection mode
  if (result) {
    return (
      <Box flexDirection="column" padding={1}>
        {result.success ? (
          <StatusMessage type="success" message={result.message} />
        ) : (
          <Box flexDirection="column">
            <StatusMessage type="error" message={result.message} />
            {result.error && <Text dimColor>{result.error}</Text>}
          </Box>
        )}
      </Box>
    );
  }

  if (installing) {
    return (
      <Box flexDirection="column" padding={1}>
        <StatusMessage type="loading" message="Installing Clix MCP Server..." />
      </Box>
    );
  }

  return <MCPInstallSelector onSelect={handleSelect} />;
};

export async function installMCPCommand(options: InstallMCPCommandOptions): Promise<void> {
  const { agent } = options;

  return new Promise((resolve) => {
    const { unmount } = render(
      <MCPInstallUI
        targetAgent={agent}
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
