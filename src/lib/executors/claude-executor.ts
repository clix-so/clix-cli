/**
 * Claude Executor - CLI-based implementation
 * Spawns the `claude` CLI command with streaming JSON output
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor, type StreamContext, type StreamParserType } from './base-executor';
import type { CLIContentBlock, ClaudeCLIMessage } from './types';

export class ClaudeExecutor extends BaseExecutor {
  constructor() {
    super({
      name: 'claude',
      command: 'claude',
      notFoundMessage:
        'Claude CLI not found. Please install Claude Code: npm install -g @anthropic-ai/claude-code',
    });
  }

  // Override execute to reset state at the start of each execution
  override async *execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage> {
    this.lastTextContent = '';
    yield* super.execute(prompt, options);
  }

  protected getStreamParserType(): StreamParserType {
    return 'jsonl';
  }

  protected buildArgs(prompt: string, _options?: ExecuteOptions): string[] {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    // Permission handling: fully auto-approve tool execution.
    // Required for non-interactive /install build steps (xcodebuild, xcrun, etc.).
    args.push('--allow-dangerously-skip-permissions');
    args.push('--permission-mode', 'bypassPermissions');

    // Always disable session persistence for command-only execution.
    args.push('--no-session-persistence');

    return args;
  }

  protected processStreamData(
    data: unknown,
    context: StreamContext,
  ): AgentMessage | AgentMessage[] | null {
    const msg = data as ClaudeCLIMessage;
    const type = msg.type;

    if (type === 'assistant' && msg.message?.content) {
      return this.processAssistantMessage(msg);
    }

    if (type === 'user' && msg.message?.content) {
      return this.processToolResultMessage(msg);
    }

    if (type === 'result') {
      return this.processResultMessage(msg, context);
    }

    return null;
  }

  private processAssistantMessage(msg: ClaudeCLIMessage): AgentMessage | AgentMessage[] | null {
    const results: AgentMessage[] = [];

    // Extract text content
    const textContent = msg.message?.content
      ?.filter(
        (block: CLIContentBlock): block is CLIContentBlock & { type: 'text'; text: string } =>
          block.type === 'text' && !!block.text,
      )
      .map((block) => block.text)
      .join('');

    if (textContent) {
      const textMessage = this.extractTextDelta(textContent, msg);
      if (textMessage) {
        results.push(textMessage);
      }
    }

    // Extract all tool uses
    const toolMessages = this.extractToolUses(msg);
    results.push(...toolMessages);

    return results.length > 0 ? (results.length === 1 ? results[0] : results) : null;
  }

  private extractToolUses(msg: ClaudeCLIMessage): AgentMessage[] {
    const toolUses =
      msg.message?.content?.filter(
        (
          block: CLIContentBlock,
        ): block is CLIContentBlock & {
          type: 'tool_use';
          name: string;
          id: string;
          input: unknown;
        } => block.type === 'tool_use' && !!block.name && !!block.id,
      ) ?? [];

    return toolUses.map((toolUse) => ({
      type: 'tool_call' as const,
      content: toolUse.name,
      metadata: { toolName: toolUse.name, toolId: toolUse.id, input: toolUse.input },
    }));
  }

  private processToolResultMessage(msg: ClaudeCLIMessage): AgentMessage | null {
    const toolResult = msg.message?.content?.find(
      (block: CLIContentBlock) => block.type === 'tool_result',
    );

    if (toolResult && 'content' in toolResult) {
      return {
        type: 'tool_result',
        content: String(toolResult.content ?? ''),
        metadata: msg as unknown as Record<string, unknown>,
      };
    }

    return null;
  }

  private processResultMessage(msg: ClaudeCLIMessage, context: StreamContext): AgentMessage | null {
    if (msg.is_error) {
      return {
        type: 'error',
        content: msg.result ?? 'Unknown error',
        metadata: msg as unknown as Record<string, unknown>,
      };
    }

    if (msg.result && !context.hasYieldedText) {
      return {
        type: 'text',
        content: msg.result,
        streamMode: 'append',
        metadata: msg as unknown as Record<string, unknown>,
      };
    }

    return null;
  }
}
