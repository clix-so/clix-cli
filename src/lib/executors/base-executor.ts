/**
 * Base Executor
 * Unified abstract base class for all CLI-based agent executors.
 * Runs each request as a standalone execution (no conversation/session persistence).
 */

import { CLIX_SYSTEM_PROMPT } from '../constants/system-prompt';
import { createLogger, type Logger } from '../debug/logger';
import type { AgentExecutor, AgentMessage, ExecuteOptions } from '../executor';
import {
  commandExists,
  parseJSONLStream,
  parseTextLineStream,
  spawnCLIProcess,
  waitForProcessExit,
} from './cli-process-manager';

/**
 * Stream parser type - determines how to parse CLI output
 */
export type StreamParserType = 'jsonl' | 'text';

/**
 * Configuration interface for CLI-based executors.
 * Subclasses provide these to customize behavior.
 */
export interface ExecutorConfig {
  /** Executor name (e.g., 'claude', 'codex', 'copilot') */
  name: string;
  /** CLI command to spawn (e.g., 'claude', 'codex', 'copilot') */
  command: string;
  /** Error message when CLI is not found */
  notFoundMessage: string;
}

/**
 * Context passed to stream processing methods
 */
export interface StreamContext {
  hasYieldedText: boolean;
  assistantContent: string;
  count: number;
}

/**
 * Abstract base class for CLI-based agent executors.
 * Implements common functionality like process lifecycle and stream parsing.
 *
 * Subclasses must implement:
 * - buildArgs(): Build CLI arguments for execution
 * - getStreamParserType(): Return 'jsonl' or 'text' for stream parser selection
 * - processStreamData(): Process a single stream item and return AgentMessage(s)
 */
export abstract class BaseExecutor implements AgentExecutor {
  readonly name: string;
  protected readonly log: Logger;

  private readonly command: string;
  private readonly notFoundMessage: string;

  constructor(config: ExecutorConfig) {
    this.name = config.name;
    this.command = config.command;
    this.notFoundMessage = config.notFoundMessage;
    this.log = createLogger(`${config.name}-executor`);
  }

  /**
   * Build CLI arguments for the given prompt.
   * @param prompt - User prompt to execute
   * @param options - Execute options
   * @returns Array of CLI arguments
   */
  protected abstract buildArgs(prompt: string, options?: ExecuteOptions): string[];

  /**
   * Get the stream parser type for this executor.
   * @returns 'jsonl' for JSON Lines parsing, 'text' for plain text parsing
   */
  protected abstract getStreamParserType(): StreamParserType;

  /**
   * Process a single stream data item and return AgentMessage(s).
   *
   * For JSONL executors: data is a parsed JSON object
   * For text executors: data is a string line
   *
   * @param data - Stream data (JSON object for JSONL, string for text)
   * @param context - Context including hasYieldedText, assistantContent, count
   * @returns AgentMessage(s) to yield, or null to skip
   */
  protected abstract processStreamData(
    data: unknown,
    context: StreamContext,
  ): AgentMessage | AgentMessage[] | null;

  /**
   * Hook called when request is aborted with partial content.
   * Override to customize the interrupted content suffix.
   */
  protected getInterruptedSuffix(): string {
    return '\n\n[Interrupted]';
  }

  /**
   * Check if debug mode is enabled.
   * Use this in buildArgs() to add debug flags to CLI commands.
   */
  protected isDebugMode(): boolean {
    const debug = process.env.DEBUG;
    return debug === '1' || debug === 'true' || debug === '*';
  }

  /**
   * Optional environment overrides for spawned CLI process.
   * Return undefined to inherit parent process environment as-is.
   */
  protected getSpawnEnv(_options?: ExecuteOptions): NodeJS.ProcessEnv | undefined {
    return undefined;
  }

  protected getPreparedPrompt(prompt: string): string {
    return `${CLIX_SYSTEM_PROMPT}\n\n${prompt}`;
  }

  async isAvailable(): Promise<boolean> {
    return commandExists(this.command);
  }

  /**
   * Handle execution errors and yield appropriate error messages.
   */
  private handleExecutionError(error: unknown): AgentMessage {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { type: 'error', content: 'Request cancelled' };
    }

    let errorMessage = 'Unknown error occurred';
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: unknown }).message;
      errorMessage = typeof msg === 'string' && msg ? msg : String(msg);
    } else if (error instanceof Error) {
      errorMessage = error.message || error.toString();
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error);
      } catch {
        errorMessage = String(error);
      }
    } else if (error !== undefined && error !== null) {
      errorMessage = String(error);
    }

    if (errorMessage === 'Unknown error occurred' || !errorMessage) {
      errorMessage = `Unknown error (type: ${typeof error}, value: ${String(error)})`;
    }

    this.log.error('Execution error', {
      errorMessage,
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      rawError: error,
    });

    return { type: 'error', content: errorMessage };
  }

  private updateAssistantContent(context: StreamContext, message: AgentMessage): void {
    if (message.type !== 'text' || !message.content) {
      return;
    }

    context.hasYieldedText = true;
    if (message.streamMode === 'replace') {
      context.assistantContent = message.content;
      return;
    }

    context.assistantContent += message.content;
  }

  async *execute(prompt: string, options?: ExecuteOptions): AsyncGenerator<AgentMessage> {
    if (!(await this.isAvailable())) {
      yield { type: 'error', content: this.notFoundMessage };
      return;
    }

    const preparedPrompt = this.getPreparedPrompt(prompt);
    const args = this.buildArgs(preparedPrompt, options);

    try {
      const fullCommand = `${this.command} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
      this.log.debug('Starting execution', {
        command: this.command,
        args,
        fullCommand,
        workingDirectory: options?.workingDirectory ?? process.cwd(),
      });

      const {
        stdout,
        stderr,
        kill,
        process: proc,
      } = spawnCLIProcess({
        command: this.command,
        args,
        workingDirectory: options?.workingDirectory ?? process.cwd(),
        signal: options?.signal,
        env: this.getSpawnEnv(options),
      });

      this.log.debug('Process spawned', { pid: proc.pid, command: fullCommand });

      const context: StreamContext = {
        hasYieldedText: false,
        assistantContent: '',
        count: 0,
      };

      const exitPromise = waitForProcessExit(proc, stderr);

      try {
        const parserType = this.getStreamParserType();
        this.log.debug(`Starting to parse ${parserType} stream`);

        const stream =
          parserType === 'jsonl' ? parseJSONLStream(stdout) : parseTextLineStream(stdout);

        for await (const data of stream) {
          context.count++;

          if (parserType === 'jsonl') {
            const dataObj = data as Record<string, unknown>;
            this.log.debug(`Received stream data #${context.count}`, {
              type: dataObj.type,
              preview: JSON.stringify(data).slice(0, 500),
            });
          } else {
            this.log.debug(`Received stream data #${context.count}`, {
              preview: String(data).slice(0, 100),
            });
          }

          if (options?.signal?.aborted) {
            kill();
            throw new DOMException('Aborted', 'AbortError');
          }

          const mapped = this.processStreamData(data, context);

          if (!mapped) {
            this.log.debug(`Stream data #${context.count} skipped (not mapped)`);
            continue;
          }

          const messages = Array.isArray(mapped) ? mapped : [mapped];
          for (const msg of messages) {
            this.log.debug('Yielding mapped message', {
              type: msg.type,
              contentLength: msg.content?.length ?? 0,
              contentPreview: msg.content?.slice(0, 100),
            });
            this.updateAssistantContent(context, msg);
            yield msg;
          }
        }

        this.log.debug('Stream parsing complete', {
          count: context.count,
          assistantContentLength: context.assistantContent.length,
        });

        await exitPromise;
        this.log.debug('Process exited successfully', { pid: proc.pid });
      } finally {
        kill();
      }

      yield { type: 'complete', content: 'Agent execution completed' };
    } catch (error) {
      yield this.handleExecutionError(error);
    }
  }
}
