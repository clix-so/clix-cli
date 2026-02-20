/**
 * Codex Executor - CLI-based implementation
 * Spawns the `codex` CLI command with JSON output
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor, type StreamContext, type StreamParserType } from './base-executor';
import type { CodexCLIMessage } from './types';

export class CodexExecutor extends BaseExecutor {
  constructor() {
    super({
      name: 'codex',
      command: 'codex',
      notFoundMessage: 'Codex CLI not found. Please install Codex: npm install -g @openai/codex',
    });
  }

  protected getStreamParserType(): StreamParserType {
    return 'jsonl';
  }

  protected buildArgs(prompt: string, options?: ExecuteOptions): string[] {
    const baseArgs = [
      '--json',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
    ];

    // Codex CLI does not support log-level flags

    // Session persistence: disable for one-shot, enable for chat
    if (options?.oneShot) {
      // One-shot mode: no session persistence
      return ['exec', prompt, ...baseArgs];
    }

    // Chat mode: resume session if available
    if (this.sessionId) {
      return ['exec', 'resume', this.sessionId, prompt, ...baseArgs];
    }

    return ['exec', prompt, ...baseArgs];
  }

  protected override extractSessionId(data: unknown): string | null {
    const msg = data as CodexCLIMessage;
    // Extract thread_id from thread.started message
    if (msg.type === 'thread.started' && msg.thread_id) {
      return msg.thread_id;
    }
    return null;
  }

  protected override onCompactionComplete(): void {
    this.sessionId = null;
  }

  protected processStreamData(
    data: unknown,
    _context: StreamContext,
  ): AgentMessage | AgentMessage[] | null {
    const msg = data as CodexCLIMessage;

    // Handle item.completed messages (main content)
    if (msg.type === 'item.completed' && msg.item) {
      const item = msg.item;

      // Agent text response
      if (item.type === 'agent_message' && item.text) {
        return {
          type: 'text',
          content: item.text,
          streamMode: 'append',
          metadata: msg as unknown as Record<string, unknown>,
        };
      }

      // Function/tool call
      if (item.type === 'function_call' && item.name) {
        return {
          type: 'tool_call',
          content: item.name,
          metadata: {
            functionName: item.name,
            arguments: item.arguments,
          },
        };
      }

      // Function/tool result
      if (item.type === 'function_return' && item.output !== undefined) {
        return {
          type: 'tool_result',
          content: item.output,
          metadata: msg as unknown as Record<string, unknown>,
        };
      }

      // Skip reasoning messages (internal thoughts)
      return null;
    }

    // Handle error messages
    if (msg.type === 'error') {
      return {
        type: 'error',
        content: msg.error ?? 'Unknown error',
      };
    }

    // Skip other message types (thread.started, turn.started, turn.completed)
    return null;
  }
}
