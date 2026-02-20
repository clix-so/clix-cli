import type { AgentInfo } from './agents';

export interface ExecuteOptions {
  workingDirectory?: string;
  allowedTools?: string[];
  signal?: AbortSignal;
  /** One-shot mode: disable session persistence and resumption */
  oneShot?: boolean;
  /** Interactive mode: enable user prompts and approval dialogs */
  interactive?: boolean;
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompactionResult {
  compacted: boolean;
  originalLength: number;
  newLength: number;
  messagesCompacted: number;
  messagesPreserved: number;
}

export interface AgentExecutor {
  name: string;
  execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage>;
  isAvailable(): Promise<boolean>;

  clearHistory(): void;
  getHistory(): ConversationMessage[];
  setHistory(history: ConversationMessage[]): void;

  /** Get underlying CLI/session identifier if supported. */
  getSessionId(): string | null;
  /** Set underlying CLI/session identifier if supported. */
  setSessionId(sessionId: string | null): void;

  /** Check if history needs compaction */
  needsCompaction(): boolean;
  /** Compact history by summarizing older messages */
  compactHistory(force?: boolean): Promise<CompactionResult>;
  /** Reset session without clearing history (for session conflict recovery) */
  resetSession(): void;
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
