/**
 * Shared types for chat hooks.
 */
import type { MutableRefObject } from 'react';
import type { AgentExecutor } from '../../../lib/executor';

/**
 * Slash command parsing result.
 */
export interface SlashCommandResult {
  handled: boolean;
  command?: string;
  args?: string[];
}

/**
 * Context usage statistics.
 */
export interface ContextUsage {
  used: number;
  remaining: number;
  totalChars: number;
  maxChars: number;
  usedTokens: number;
  maxTokens: number;
}

/**
 * Shared refs between chat hooks.
 */
export interface ChatRefs {
  executorRef: MutableRefObject<AgentExecutor | null>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  chatSessionIdRef: MutableRefObject<string | null>;
  agentSessionMapRef: MutableRefObject<Record<string, string | null>>;
}
