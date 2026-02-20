/**
 * OpenCode Executor - CLI-based implementation
 * Spawns the `opencode` CLI command with streaming JSON output
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor, type StreamContext, type StreamParserType } from './base-executor';
import type {
  OpenCodeCLIErrorEvent,
  OpenCodeCLIMessage,
  OpenCodeCLIMessageEvent,
  OpenCodeCLISessionEvent,
  OpenCodeCLITextEvent,
  OpenCodeCLIToolCallEvent,
  OpenCodeCLIToolResultEvent,
} from './types';

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super({
      name: 'opencode',
      command: 'opencode',
      notFoundMessage:
        'OpenCode CLI not found. Please install OpenCode: https://opencode.ai/docs/cli/',
    });
  }

  protected getStreamParserType(): StreamParserType {
    return 'jsonl';
  }

  protected override getSpawnEnv(_options?: ExecuteOptions): NodeJS.ProcessEnv | undefined {
    if (process.env.OPENCODE_PERMISSION) {
      return undefined;
    }

    // Default to allow-all tool permission to avoid interactive approval prompts.
    return {
      ...process.env,
      OPENCODE_PERMISSION: '{"*":"allow"}',
    };
  }

  protected buildArgs(prompt: string, options?: ExecuteOptions): string[] {
    const args = ['run', '--format', 'json'];

    // 세션 관리
    if (!options?.oneShot && this.sessionId) {
      // 특정 세션 재개
      args.push('-s', this.sessionId);
    } else if (!options?.oneShot) {
      // 마지막 세션 계속
      args.push('-c');
    }

    // 디버그 모드
    if (this.isDebugMode()) {
      args.push('--print-logs', '--log-level', 'DEBUG');
    }

    // 프롬프트 (마지막 인자)
    args.push(prompt);

    return args;
  }

  protected override extractSessionId(data: unknown): string | null {
    const msg = data as OpenCodeCLIMessage;

    // sessionID 필드 직접 확인 (모든 메시지에 포함될 수 있음)
    if (msg.sessionID) {
      return msg.sessionID;
    }

    // 세션 시작 메시지 타입 확인
    if (msg.type === 'session' || msg.type === 'start') {
      return (msg as OpenCodeCLISessionEvent).sessionID ?? null;
    }

    return null;
  }

  protected override onCompactionComplete(): void {
    // 히스토리 컴팩션 후 세션 리셋
    this.sessionId = null;
  }

  protected processStreamData(
    data: unknown,
    _context: StreamContext,
  ): AgentMessage | AgentMessage[] | null {
    const msg = data as OpenCodeCLIMessage;
    const type = msg.type;

    // 텍스트 메시지 처리
    if (type === 'message') {
      const messageEvent = msg as OpenCodeCLIMessageEvent;
      if (messageEvent.content) {
        return {
          type: 'text',
          content: messageEvent.content,
          streamMode: 'append',
          metadata: {
            role: messageEvent.role,
            timestamp: messageEvent.timestamp,
          },
        };
      }
    }

    if (type === 'text') {
      const textEvent = msg as OpenCodeCLITextEvent;
      const text = textEvent.part?.text;
      if (text) {
        return {
          type: 'text',
          content: text,
          streamMode: 'append',
          metadata: {
            timestamp: textEvent.timestamp,
          },
        };
      }
    }

    // 도구 호출 처리
    if (type === 'tool_call' || type === 'tool_use') {
      const toolEvent = msg as OpenCodeCLIToolCallEvent;
      const toolName: string = toolEvent.part?.tool ?? 'Tool';
      const toolId = toolEvent.part?.callID ?? toolEvent.part?.id;
      const toolState = (toolEvent.part?.state ?? {}) as {
        status?: 'pending' | 'completed' | 'error';
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
      };

      const toolCall: AgentMessage = {
        type: 'tool_call',
        content: toolName,
        metadata: {
          toolName,
          toolId,
          input: toolState.input,
          status: toolState.status,
        },
      };

      const toolOutput = toolState.error ?? toolState.output;
      if (toolOutput !== undefined) {
        const toolResult: AgentMessage = {
          type: 'tool_result',
          content: String(toolOutput ?? ''),
          metadata: {
            toolId,
            hasError: toolState.status === 'error',
            status: toolState.status,
          },
        };
        return [toolCall, toolResult];
      }

      return toolCall;
    }

    // 도구 결과 처리
    if (type === 'tool_result') {
      const resultEvent = msg as OpenCodeCLIToolResultEvent;
      const toolState = (resultEvent.part?.state ?? {}) as {
        status?: 'completed' | 'error';
        output?: string;
        error?: string;
      };
      const content = toolState.error ?? toolState.output ?? '';
      return {
        type: 'tool_result',
        content,
        metadata: {
          toolId: resultEvent.part?.callID ?? resultEvent.part?.id,
          hasError: toolState.status === 'error',
          status: toolState.status,
        },
      };
    }

    // 에러 처리
    if (type === 'error') {
      const errorEvent = msg as OpenCodeCLIErrorEvent;
      return {
        type: 'error',
        content: errorEvent.error.data.message || errorEvent.error.name,
        metadata: {
          errorName: errorEvent.error.name,
          statusCode: errorEvent.error.data.statusCode,
          isRetryable: errorEvent.error.data.isRetryable,
        },
      };
    }

    // 완료 메시지는 base class에서 처리
    // 세션 시작 메시지는 sessionID만 추출

    return null;
  }
}
