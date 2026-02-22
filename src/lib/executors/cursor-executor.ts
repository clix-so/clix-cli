/**
 * Cursor Executor - CLI-based implementation
 * Spawns the `agent` CLI command with streaming JSON output
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor, type StreamContext, type StreamParserType } from './base-executor';
import { extractCumulativeDelta } from './stream-delta';
import type { CLIContentBlock, CursorCLIMessage } from './types';

export class CursorExecutor extends BaseExecutor {
  private lastTextContent = '';

  constructor() {
    super({
      name: 'cursor',
      command: 'agent',
      notFoundMessage:
        'Cursor Agent CLI not found. Please install from: https://cursor.com/docs/agent',
    });
  }

  override async *execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage> {
    this.lastTextContent = '';
    yield* super.execute(prompt, options);
  }

  protected getStreamParserType(): StreamParserType {
    return 'jsonl';
  }

  protected buildArgs(prompt: string, options?: ExecuteOptions): string[] {
    const args = ['-p', '--output-format', 'stream-json'];

    // 프롬프트 추가
    args.push(prompt);

    // Force mode: 자동 승인
    args.push('-f');

    // MCP 서버 자동 승인
    args.push('--approve-mcps');

    // 작업 디렉토리 설정
    if (options?.workingDirectory) {
      args.push('--workspace', options.workingDirectory);
    }

    return args;
  }

  private extractTextDelta(textContent: string, msg: CursorCLIMessage): AgentMessage | null {
    const delta = extractCumulativeDelta(this.lastTextContent, textContent);

    this.lastTextContent = textContent;

    if (!delta) {
      return null;
    }

    return {
      type: 'text',
      content: delta,
      streamMode: 'append',
      metadata: msg as unknown as Record<string, unknown>,
    };
  }

  private mapAssistantMessage(msg: CursorCLIMessage): AgentMessage | AgentMessage[] | null {
    if (!msg.message?.content) return null;

    const results: AgentMessage[] = [];

    // 텍스트 콘텐츠 추출
    const textContent = msg.message.content
      .filter(
        (block): block is CLIContentBlock & { type: 'text'; text: string } =>
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

    // 도구 호출 추출
    const toolUses = msg.message.content.filter(
      (
        block,
      ): block is CLIContentBlock & {
        type: 'tool_use';
        name: string;
        id: string;
        input: unknown;
      } => block.type === 'tool_use' && !!block.name && !!block.id,
    );

    for (const toolUse of toolUses) {
      results.push({
        type: 'tool_call',
        content: toolUse.name,
        metadata: { toolName: toolUse.name, toolId: toolUse.id, input: toolUse.input },
      });
    }

    return results.length > 0 ? (results.length === 1 ? results[0] : results) : null;
  }

  private mapUserMessage(msg: CursorCLIMessage): AgentMessage | null {
    if (!msg.message?.content) return null;

    const toolResult = msg.message.content.find(
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

  private mapResultMessage(msg: CursorCLIMessage, hasYieldedText: boolean): AgentMessage | null {
    if (msg.is_error) {
      return {
        type: 'error',
        content: msg.result ?? 'Unknown error',
        metadata: msg as unknown as Record<string, unknown>,
      };
    }
    if (msg.result && !hasYieldedText) {
      return {
        type: 'text',
        content: msg.result,
        metadata: msg as unknown as Record<string, unknown>,
      };
    }
    return null;
  }

  protected processStreamData(
    data: unknown,
    context: StreamContext,
  ): AgentMessage | AgentMessage[] | null {
    const msg = data as CursorCLIMessage;
    const type = msg.type;

    // System init 메시지 스킵 (session_id만 추출)
    if (type === 'system') {
      return null;
    }

    // Thinking 메시지 스킵 (내부 추론, 사용자에게 표시 안 함)
    if (type === 'thinking') {
      return null;
    }

    // Assistant 메시지 처리
    if (type === 'assistant') {
      return this.mapAssistantMessage(msg);
    }

    // 도구 결과 처리
    if (type === 'user') {
      return this.mapUserMessage(msg);
    }

    // Result 메시지 처리
    if (type === 'result') {
      return this.mapResultMessage(msg, context.hasYieldedText);
    }

    return null;
  }
}
