/**
 * Base Executor
 * Unified abstract base class for all CLI-based agent executors
 * Provides common implementation for history management, process spawning, and stream parsing
 */

import { CLIX_SYSTEM_PROMPT } from '../constants/system-prompt';
import { createLogger, type Logger } from '../debug/logger';
import type {
  AgentExecutor,
  AgentMessage,
  CompactionResult,
  ConversationMessage,
  ExecuteOptions,
} from '../executor';
import {
  calculateHistorySize,
  DEFAULT_COMPACTION_THRESHOLD,
  getCompactionService,
} from '../services/history-compaction';
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
 * Implements common functionality like history management, process lifecycle, and stream parsing.
 *
 * Subclasses must implement:
 * - buildArgs(): Build CLI arguments for execution
 * - getStreamParserType(): Return 'jsonl' or 'text' for stream parser selection
 * - processStreamData(): Process a single stream item and return AgentMessage(s)
 *
 * Subclasses may optionally override:
 * - extractSessionId(): Extract session ID from stream data (for session resumption)
 * - onCompactionComplete(): Hook called after compaction (e.g., to reset session)
 * - getInterruptedSuffix(): Customize interrupted content suffix
 */
export abstract class BaseExecutor implements AgentExecutor {
  readonly name: string;
  protected history: ConversationMessage[] = [];
  protected sessionId: string | null = null;
  protected systemPromptInjected = false;
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
   * @param options - Execute options (includes oneShot flag)
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
   * Extract session ID from stream data (optional).
   * Override this for CLIs that support session resumption.
   *
   * @param data - Stream data (JSON object for JSONL, string for text)
   */
  protected extractSessionId(_data: unknown): string | null {
    return null;
  }

  /**
   * Hook called after compaction completes.
   * Override to perform cleanup (e.g., reset session ID).
   */
  protected onCompactionComplete(): void {
    // Default: no-op
  }

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

  protected getPreparedPrompt(prompt: string, options?: ExecuteOptions): string {
    const shouldInject = options?.oneShot || !this.systemPromptInjected;
    if (!shouldInject) {
      return prompt;
    }

    this.systemPromptInjected = true;
    return `${CLIX_SYSTEM_PROMPT}

${prompt}`;
  }

  async isAvailable(): Promise<boolean> {
    return commandExists(this.command);
  }

  /**
   * Handle execution errors and yield appropriate error messages.
   */
  private handleExecutionError(error: unknown): AgentMessage {
    // Remove the failed user message from history
    this.history.pop();

    // Handle abort errors gracefully - preserve session ID for user cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { type: 'error', content: 'Request cancelled' };
    }

    // Reset session only for actual errors (not user cancellation)
    this.sessionId = null;

    // Extract error message from various error types
    // Use duck typing first to handle cross-realm Error objects
    let errorMessage = 'Unknown error occurred';
    if (error && typeof error === 'object' && 'message' in error) {
      // Duck typing: check for message property first (handles cross-realm Errors)
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

    // Add debug info if still unknown
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
    // Check if CLI is available
    if (!(await this.isAvailable())) {
      yield { type: 'error', content: this.notFoundMessage };
      return;
    }

    // Add user message to history
    this.history.push({ role: 'user', content: prompt });

    const preparedPrompt = this.getPreparedPrompt(prompt, options);
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

      // Start waiting for process exit (don't await yet)
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

          // Check abort signal
          if (options?.signal?.aborted) {
            if (context.assistantContent) {
              this.history.push({
                role: 'assistant',
                content: context.assistantContent + this.getInterruptedSuffix(),
              });
            }
            kill();
            throw new DOMException('Aborted', 'AbortError');
          }

          // Extract session ID if available
          const sessionId = this.extractSessionId(data);
          if (sessionId) {
            this.log.debug('Extracted session ID', { sessionId });
            this.sessionId = sessionId;
          }

          const mapped = this.processStreamData(data, context);

          if (!mapped) {
            this.log.debug(`Stream data #${context.count} skipped (not mapped)`);
            continue;
          }

          // Handle both single and multiple messages
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

        // Wait for process to complete
        await exitPromise;
        this.log.debug('Process exited successfully', { pid: proc.pid });
      } finally {
        kill();
      }

      // Add assistant response to history
      if (context.assistantContent) {
        this.history.push({ role: 'assistant', content: context.assistantContent });
      }

      yield { type: 'complete', content: 'Agent execution completed' };
    } catch (error) {
      yield this.handleExecutionError(error);
    }
  }

  clearHistory(): void {
    this.sessionId = null;
    this.systemPromptInjected = false;
    this.history = [];
  }

  resetSession(): void {
    this.sessionId = null;
    this.systemPromptInjected = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  getHistory(): ConversationMessage[] {
    return [...this.history];
  }

  setHistory(history: ConversationMessage[]): void {
    this.history = [...history];
    this.sessionId = null;
  }

  needsCompaction(): boolean {
    return calculateHistorySize(this.history) >= DEFAULT_COMPACTION_THRESHOLD;
  }

  async compactHistory(force?: boolean): Promise<CompactionResult> {
    const service = getCompactionService();
    const { newHistory, result } = await service.compact(this.history, this, { force });

    if (result.compacted) {
      this.history = newHistory;
      this.onCompactionComplete();
    }

    return result;
  }
}
