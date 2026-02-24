import type { AgentInfo } from './agents';

export interface ExecuteOptions {
  workingDirectory?: string;
  signal?: AbortSignal;
}

export type AgentTextStreamMode = 'append' | 'replace';

export interface AgentMessage {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'complete';
  content: string;
  /**
   * Streaming mode for text chunks.
   * - append: concatenate chunk to current content
   * - replace: replace current content with this chunk
   */
  streamMode?: AgentTextStreamMode;
  metadata?: Record<string, unknown>;
}

export interface AgentExecutor {
  name: string;
  execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage>;
  isAvailable(): Promise<boolean>;
}

export async function createExecutor(agent: AgentInfo): Promise<AgentExecutor> {
  switch (agent.name) {
    case 'claude': {
      const { ClaudeExecutor } = await import('./executors/claude-executor.js');
      return new ClaudeExecutor();
    }
    case 'codex': {
      const { CodexExecutor } = await import('./executors/codex-executor.js');
      return new CodexExecutor();
    }
    case 'gemini': {
      const { GeminiExecutor } = await import('./executors/gemini-executor.js');
      return new GeminiExecutor();
    }
    case 'opencode': {
      const { OpenCodeExecutor } = await import('./executors/opencode-executor.js');
      return new OpenCodeExecutor();
    }
    case 'cursor': {
      const { CursorExecutor } = await import('./executors/cursor-executor.js');
      return new CursorExecutor();
    }
    case 'copilot': {
      const { CopilotExecutor } = await import('./executors/copilot-executor.js');
      return new CopilotExecutor();
    }
    default:
      throw new Error(`Unknown agent: ${agent.name}`);
  }
}
