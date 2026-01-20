/**
 * Type definitions for CLI JSON output formats
 */

/**
 * Common CLI content block format used by Claude CLI and Cursor CLI
 */
export interface CLIContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string;
  tool_use_id?: string;
}

/**
 * Claude CLI JSONL message format (--output-format stream-json)
 */
export interface ClaudeCLIMessage {
  type: 'assistant' | 'user' | 'result' | 'system';
  message?: {
    content: CLIContentBlock[];
  };
  session_id?: string;
  result?: string;
  is_error?: boolean;
}

/**
 * Codex CLI JSONL message format (--json)
 * Example output:
 * {"type":"thread.started","thread_id":"..."}
 * {"type":"turn.started"}
 * {"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"..."}}
 * {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"..."}}
 * {"type":"turn.completed","usage":{...}}
 */
export interface CodexCLIItem {
  id: string;
  type: 'reasoning' | 'agent_message' | 'function_call' | 'function_return' | string;
  text?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

export interface CodexCLIMessage {
  type: 'thread.started' | 'turn.started' | 'item.completed' | 'turn.completed' | 'error' | string;
  thread_id?: string;
  item?: CodexCLIItem;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

/**
 * Gemini CLI JSONL message format (--output-format stream-json)
 * Based on @google/gemini-cli stream-json output format
 */
export type GeminiCLIEventType =
  | 'init'
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'result';

export interface GeminiCLIInitEvent {
  type: 'init';
  timestamp: string;
  session_id: string;
  model: string;
}

export interface GeminiCLIMessageEvent {
  type: 'message';
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  delta?: boolean;
}

export interface GeminiCLIToolUseEvent {
  type: 'tool_use';
  timestamp: string;
  tool_name: string;
  tool_id: string;
  parameters: Record<string, unknown>;
}

export interface GeminiCLIToolResultEvent {
  type: 'tool_result';
  timestamp: string;
  tool_id: string;
  status: 'success' | 'error';
  output?: string;
  error?: {
    type: string;
    message: string;
  };
}

export interface GeminiCLIErrorEvent {
  type: 'error';
  timestamp: string;
  severity: 'warning' | 'error';
  message: string;
}

export interface GeminiCLIResultEvent {
  type: 'result';
  timestamp: string;
  status: 'success' | 'error';
  error?: {
    type: string;
    message: string;
  };
  stats?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached: number;
    input: number;
    duration_ms: number;
    tool_calls: number;
  };
}

export type GeminiCLIMessage =
  | GeminiCLIInitEvent
  | GeminiCLIMessageEvent
  | GeminiCLIToolUseEvent
  | GeminiCLIToolResultEvent
  | GeminiCLIErrorEvent
  | GeminiCLIResultEvent;

/**
 * OpenCode CLI JSONL message format (--format json)
 * Based on actual OpenCode CLI output
 */
export type OpenCodeCLIEventType =
  | 'session'
  | 'start'
  | 'step_start'
  | 'step_finish'
  | 'message'
  | 'text'
  | 'tool_call'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'complete';

export interface OpenCodeCLIBaseEvent {
  type: OpenCodeCLIEventType;
  timestamp: number;
  sessionID?: string;
}

export interface OpenCodeCLISessionEvent extends OpenCodeCLIBaseEvent {
  type: 'session' | 'start';
  sessionID: string;
  model?: string;
}

export interface OpenCodeCLIMessageEvent extends OpenCodeCLIBaseEvent {
  type: 'message';
  content: string;
  role?: 'user' | 'assistant';
}

export interface OpenCodeCLITextEvent extends OpenCodeCLIBaseEvent {
  type: 'text';
  part: {
    text?: string;
    time?: {
      start?: number;
      end?: number;
    };
    [key: string]: unknown;
  };
}

export interface OpenCodeCLIToolCallEvent extends OpenCodeCLIBaseEvent {
  type: 'tool_call' | 'tool_use';
  part: {
    id?: string;
    sessionID?: string;
    messageID?: string;
    type?: string;
    callID?: string;
    tool?: string;
    state?: {
      status?: 'pending' | 'completed' | 'error';
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface OpenCodeCLIToolResultEvent extends OpenCodeCLIBaseEvent {
  type: 'tool_result';
  part: {
    id?: string;
    callID?: string;
    state?: {
      status?: 'completed' | 'error';
      output?: string;
      error?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface OpenCodeCLIStepStartEvent extends OpenCodeCLIBaseEvent {
  type: 'step_start' | 'step_finish';
  part: {
    id?: string;
    sessionID?: string;
    messageID?: string;
    type?: string;
    snapshot?: string;
    [key: string]: unknown;
  };
}

export interface OpenCodeCLIErrorEvent extends OpenCodeCLIBaseEvent {
  type: 'error';
  error: {
    name: string;
    data: {
      message: string;
      statusCode?: number;
      isRetryable?: boolean;
      [key: string]: unknown;
    };
  };
}

export interface OpenCodeCLICompleteEvent extends OpenCodeCLIBaseEvent {
  type: 'done' | 'complete';
  stats?: {
    tokens?: number;
    duration?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type OpenCodeCLIMessage =
  | OpenCodeCLISessionEvent
  | OpenCodeCLIStepStartEvent
  | OpenCodeCLIMessageEvent
  | OpenCodeCLITextEvent
  | OpenCodeCLIToolCallEvent
  | OpenCodeCLIToolResultEvent
  | OpenCodeCLIErrorEvent
  | OpenCodeCLICompleteEvent;

/**
 * Cursor CLI JSONL message format (--output-format stream-json)
 * Similar to Claude Code CLI but with some differences (thinking, system messages)
 */
export interface CursorCLIMessage {
  type: 'system' | 'assistant' | 'user' | 'result' | 'thinking';
  subtype?: 'init' | 'delta';
  message?: {
    role?: 'user' | 'assistant';
    content: CLIContentBlock[];
  };
  session_id?: string;
  result?: string;
  is_error?: boolean;
  // System/init specific fields
  apiKeySource?: string;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  // Thinking specific fields
  text?: string;
  timestamp_ms?: number;
}
