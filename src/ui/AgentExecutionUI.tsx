import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AgentInfo } from '@/lib/agents';
import { getConfigManager } from '@/lib/config/index';
import { type AgentExecutor, type AgentMessage, createExecutor } from '@/lib/executor';
import { AgentSelectionService } from '@/lib/services/agent-selection-service';
import { Header } from '@/ui/components/Header';
import { NoAgentGuide } from '@/ui/components/NoAgentGuide';
import { StatusMessage } from '@/ui/components/StatusMessage';
import { ToolCallDisplay } from '@/ui/components/ToolCallDisplay';
import { useCancelInput } from '@/ui/hooks';
import type { FinalOutputResult } from '@/ui/utils/finalOutput';
import { MarkdownDisplay } from '@/ui/utils/MarkdownDisplay';

type ExecutionPhase =
  | 'loading_config'
  | 'checking_agent'
  | 'preparing'
  | 'executing'
  | 'complete'
  | 'no_agent'
  | 'error';

async function loadAgentConfig(
  setPhase: (phase: ExecutionPhase) => void,
): Promise<AgentInfo | null> {
  const configManager = getConfigManager();
  const selectionService = new AgentSelectionService(configManager);

  setPhase('checking_agent');

  const result = await selectionService.selectAgent({
    mode: 'command',
  });

  if (!result.agent) {
    return null;
  }

  // Save selection if it was auto-selected
  if (result.source === 'auto') {
    await selectionService.saveSelection(result.agent);
  }

  return result.agent;
}

interface ToolState {
  activeTool: string | null;
  progressAction: string | null;
  completedCount: number;
  hasRecentText: boolean;
}

function analyzeToolState(messages: AgentMessage[]): ToolState {
  const pendingTools: string[] = [];
  let completedCount = 0;
  let hasRecentText = false;
  let progressAction: string | null = null;

  for (const msg of messages) {
    if (msg.type === 'tool_call') {
      pendingTools.push(msg.content);
      progressAction = null; // Clear progress when tool is called
    } else if (msg.type === 'tool_result' && pendingTools.length > 0) {
      pendingTools.shift(); // FIFO - match with first pending
      completedCount++;
    } else if (msg.type === 'text') {
      // Check for progress metadata (from TextBasedExecutor)
      if (msg.metadata?.isProgress && msg.metadata?.progressAction) {
        progressAction = msg.metadata.progressAction as string;
      }
      if (msg.content.trim()) {
        hasRecentText = true;
      }
    }
  }

  return {
    activeTool: pendingTools.length > 0 ? pendingTools[0] : null,
    progressAction,
    completedCount,
    hasRecentText,
  };
}

interface ExecutionProgressProps {
  messages: AgentMessage[];
}

const ExecutionProgress: React.FC<ExecutionProgressProps> = ({ messages }) => {
  const toolState = analyzeToolState(messages);

  // Get latest non-empty text line for progress display
  let latestTextPreview = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'text' && messages[i].content.trim()) {
      const lines = messages[i].content.split('\n').filter((l) => l.trim());
      if (lines.length > 0) {
        latestTextPreview = lines[lines.length - 1].trim();
        break;
      }
    }
  }

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      {/* Active tool execution (JSONL-based executors) */}
      {toolState.activeTool && (
        <ToolCallDisplay toolName={toolState.activeTool} content="" status="pending" />
      )}

      {/* Completed tool summary */}
      {toolState.completedCount > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>
            <Text color="green">✓</Text> {toolState.completedCount} tool
            {toolState.completedCount > 1 ? 's' : ''} executed
          </Text>
        </Box>
      )}

      {/* Show progress spinner - always visible during execution */}
      {!toolState.activeTool && (
        <Box flexDirection="row">
          <Text dimColor>
            <Spinner type="dots" />
          </Text>
          <Box marginLeft={1}>
            {latestTextPreview ? (
              <MarkdownDisplay text={latestTextPreview} />
            ) : (
              <Text>{messages.length === 0 ? 'Starting execution...' : 'Thinking...'}</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

async function processMessages(
  execute: (executor: AgentExecutor, agent: AgentInfo) => AsyncGenerator<AgentMessage>,
  executor: AgentExecutor,
  agent: AgentInfo,
  setExecutionMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
  signal?: AbortSignal,
): Promise<AgentMessage[]> {
  const messages: AgentMessage[] = [];
  for await (const message of execute(executor, agent)) {
    if (signal?.aborted) {
      break;
    }
    messages.push(message);
    setExecutionMessages([...messages]);

    if (message.type === 'error') {
      throw new Error(message.content);
    }
  }
  return messages;
}

export interface AgentExecutionUIProps {
  /** Title displayed in the header */
  title: string;
  /** Optional description shown during execution */
  description?: string;
  /**
   * Execute function that receives an executor and returns messages.
   * This is called after the agent is loaded and ready.
   */
  execute: (executor: AgentExecutor, agent: AgentInfo) => AsyncGenerator<AgentMessage>;
  /**
   * Optional prepare function called before execution.
   * Use this for setup steps like MCP server installation.
   * Receives the agent info for agent-specific setup.
   */
  prepare?: (agent: AgentInfo) => Promise<void>;
  /** Callback when execution completes. If not provided, app will exit. */
  onComplete?: (result?: FinalOutputResult) => void;
  /** Callback when no agent is configured. If not provided, shows NoAgentGuide. */
  onNeedsConfig?: () => void;
}

export const AgentExecutionUI: React.FC<AgentExecutionUIProps> = ({
  title,
  description,
  execute,
  prepare,
  onComplete,
  onNeedsConfig,
}) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<ExecutionPhase>('loading_config');
  const [agentName, setAgentName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [executionMessages, setExecutionMessages] = useState<AgentMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Handle ESC or Ctrl+C to cancel execution
  useCancelInput(
    () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    },
    { isActive: isExecuting },
  );

  useEffect(() => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Helper to handle completion callback or exit
    const handleCompletion = (result?: FinalOutputResult, delayMs = 1500) => {
      if (onComplete) {
        setTimeout(() => onComplete(result), delayMs);
      } else {
        setTimeout(() => exit(), delayMs);
      }
    };

    const run = async () => {
      try {
        setPhase('loading_config');
        await delay(500);

        const agent = await loadAgentConfig(setPhase);

        if (!agent) {
          if (onNeedsConfig) {
            onNeedsConfig();
            return;
          }
          setPhase('no_agent');
          return;
        }

        setAgentName(agent.displayName);
        await delay(300);

        // Run prepare step if provided
        if (prepare) {
          setPhase('preparing');
          await prepare(agent);
          await delay(300);
        }

        setPhase('executing');
        setIsExecuting(true);
        const executor = await createExecutor(agent);
        const messages = await processMessages(
          execute,
          executor,
          agent,
          setExecutionMessages,
          abortController.signal,
        );
        setIsExecuting(false);

        if (abortController.signal.aborted) {
          // Cancelled by user
          setPhase('complete');
          handleCompletion({
            type: 'info',
            title: `${title} cancelled`,
            message: 'Execution was interrupted by user',
          });
          return;
        }

        setPhase('complete');

        // Collect result information for final output
        const textMessages = messages
          .filter((msg) => msg.type === 'text' && msg.content.trim())
          .map((msg) => msg.content.trim());

        handleCompletion({
          type: 'success',
          title: `${title} completed`,
          message: description,
          details: textMessages.length > 0 ? textMessages : undefined,
        });
      } catch (error) {
        setIsExecuting(false);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setErrorMessage(message);
        setPhase('error');

        handleCompletion({
          type: 'error',
          title: `${title} failed`,
          message,
        });
      }
    };

    run();

    return () => {
      abortControllerRef.current = null;
    };
  }, [execute, prepare, onComplete, onNeedsConfig, exit, title, description]);

  const handleNoAgentExit = () => {
    exit();
  };

  if (phase === 'no_agent') {
    return <NoAgentGuide onExit={handleNoAgentExit} />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={title} />

      {phase === 'loading_config' && (
        <StatusMessage type="loading" message="Loading configuration..." />
      )}

      {phase === 'checking_agent' && (
        <StatusMessage type="loading" message="Checking AI agent availability..." />
      )}

      {phase === 'preparing' && (
        <Box flexDirection="column">
          <StatusMessage type="success" message={`Using ${agentName}`} />
          <StatusMessage type="loading" message="Preparing..." />
        </Box>
      )}

      {phase === 'executing' && (
        <Box flexDirection="column">
          <StatusMessage type="success" message={`Using ${agentName}`} />
          <Box marginTop={1}>
            <Text bold>Running {title}...</Text>
          </Box>
          {description && (
            <Box marginTop={1} marginLeft={2}>
              <Text dimColor>{description}</Text>
            </Box>
          )}

          {/* Show execution progress */}
          <ExecutionProgress messages={executionMessages} />

          {/* Cancel hint */}
          <Box marginTop={1} marginLeft={2}>
            <Text dimColor>Press </Text>
            <Text color="gray">Ctrl+C</Text>
            <Text dimColor> or </Text>
            <Text color="gray">Esc</Text>
            <Text dimColor> to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === 'complete' && (
        <Box flexDirection="column">
          <StatusMessage type="success" message={`Using ${agentName}`} />
          <Box marginTop={1}>
            <Text bold>
              <Text color="green">✓</Text> {title} completed
            </Text>
          </Box>
          {description && (
            <Box marginTop={1} marginLeft={2}>
              <Text dimColor>{description}</Text>
            </Box>
          )}

          {/* Show execution summary */}
          {executionMessages.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={2}>
              {/* Count and display tool executions */}
              {(() => {
                const toolCount = executionMessages.filter(
                  (msg) => msg.type === 'tool_call',
                ).length;
                if (toolCount > 0) {
                  return (
                    <Box marginBottom={1}>
                      <Text dimColor>
                        <Text color="green">✓</Text> {toolCount} tool{toolCount > 1 ? 's' : ''}{' '}
                        executed
                      </Text>
                    </Box>
                  );
                }
                return null;
              })()}
            </Box>
          )}
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <StatusMessage type="error" message={errorMessage} />
        </Box>
      )}
    </Box>
  );
};
