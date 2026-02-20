/**
 * Gemini Executor - CLI-based implementation
 * Spawns the `gemini` CLI command with streaming JSON output
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor, type StreamContext, type StreamParserType } from './base-executor';
import { extractCumulativeDelta } from './stream-delta';
import type {
  GeminiCLIErrorEvent,
  GeminiCLIInitEvent,
  GeminiCLIMessage,
  GeminiCLIMessageEvent,
  GeminiCLIResultEvent,
  GeminiCLIToolResultEvent,
  GeminiCLIToolUseEvent,
} from './types';

export class GeminiExecutor extends BaseExecutor {
  private lastTextContent = '';

  constructor() {
    super({
      name: 'gemini',
      command: 'gemini',
      notFoundMessage:
        'Gemini CLI not found. Please install Gemini CLI: npm install -g @google/gemini-cli',
    });
  }

  protected getStreamParserType(): StreamParserType {
    return 'jsonl';
  }

  protected buildArgs(prompt: string, options?: ExecuteOptions): string[] {
    // Use positional argument for prompt (recommended by Gemini CLI)
    const args = [prompt, '-o', 'stream-json'];

    // Use gemini-3-flash-preview model for faster responses
    args.push('-m', 'gemini-3-flash-preview');

    // Add debug flag in debug mode
    if (this.isDebugMode()) {
      args.push('-d');
    }

    // Session persistence: resume session if available (not in one-shot mode)
    if (!options?.oneShot && this.sessionId) {
      args.push('-r', this.sessionId);
    }

    // YOLO mode: auto-approve all tool calls (file edits, shell commands, etc.)
    // Similar to Claude's acceptEdits mode
    args.push('-y');

    return args;
  }

  protected override extractSessionId(data: unknown): string | null {
    const msg = data as GeminiCLIMessage;
    if (msg.type === 'init') {
      return (msg as GeminiCLIInitEvent).session_id ?? null;
    }
    return null;
  }

  protected override onCompactionComplete(): void {
    this.sessionId = null;
  }

  override async *execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage> {
    this.lastTextContent = '';
    yield* super.execute(prompt, options);
  }

  protected processStreamData(
    data: unknown,
    _context: StreamContext,
  ): AgentMessage | AgentMessage[] | null {
    const msg = data as GeminiCLIMessage;
    const type = msg.type;

    // Handle assistant messages
    if (type === 'message') {
      const messageEvent = msg as GeminiCLIMessageEvent;
      // Only process assistant messages, not user messages
      if (messageEvent.role === 'assistant' && messageEvent.content) {
        const nextTextContent =
          messageEvent.delta === true
            ? `${this.lastTextContent}${messageEvent.content}`
            : messageEvent.content;
        const delta = extractCumulativeDelta(this.lastTextContent, nextTextContent);
        this.lastTextContent = nextTextContent;

        if (!delta) {
          return null;
        }

        return {
          type: 'text',
          content: delta,
          streamMode: 'append',
          metadata: {
            delta: messageEvent.delta,
            timestamp: messageEvent.timestamp,
          },
        };
      }
    }

    // Handle tool use events
    if (type === 'tool_use') {
      const toolEvent = msg as GeminiCLIToolUseEvent;
      return {
        type: 'tool_call',
        content: toolEvent.tool_name,
        metadata: {
          toolName: toolEvent.tool_name,
          toolId: toolEvent.tool_id,
          parameters: toolEvent.parameters,
        },
      };
    }

    // Handle tool result events
    if (type === 'tool_result') {
      const resultEvent = msg as GeminiCLIToolResultEvent;
      const content =
        resultEvent.status === 'error'
          ? (resultEvent.error?.message ?? 'Tool execution failed')
          : (resultEvent.output ?? '');
      return {
        type: 'tool_result',
        content,
        metadata: {
          toolId: resultEvent.tool_id,
          status: resultEvent.status,
        },
      };
    }

    // Handle error events (only non-warning severity)
    if (type === 'error') {
      const errorEvent = msg as GeminiCLIErrorEvent;
      if (errorEvent.severity === 'error') {
        return {
          type: 'error',
          content: errorEvent.message,
          metadata: { severity: errorEvent.severity },
        };
      }
      // Skip warnings
    }

    // Handle result events (final status)
    if (type === 'result') {
      const resultEvent = msg as GeminiCLIResultEvent;
      if (resultEvent.status === 'error' && resultEvent.error) {
        return {
          type: 'error',
          content: resultEvent.error.message,
          metadata: { stats: resultEvent.stats },
        };
      }
      // Success result is handled by base class complete message
    }

    return null;
  }
}
