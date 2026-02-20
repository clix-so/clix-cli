/**
 * GitHub Copilot CLI Executor
 * Text-based executor for GitHub Copilot CLI
 */
import type { AgentMessage, ExecuteOptions } from '../executor';
import { BaseExecutor as BaseExecutorClass, type StreamParserType } from './base-executor';

/**
 * Executor for GitHub Copilot CLI.
 * Uses text-based output parsing since Copilot CLI doesn't support JSONL.
 *
 * Features:
 * - Non-interactive mode with -p flag
 * - Silent mode to filter out statistics
 * - Session resumption with --resume flag
 * - Tool auto-approval with --allow-all-tools
 */
export class CopilotExecutor extends BaseExecutorClass {
  constructor() {
    super({
      name: 'copilot',
      command: 'copilot',
      notFoundMessage:
        'GitHub Copilot CLI not found. Install with: brew install copilot-cli or npm install -g @github/copilot',
    });
  }

  protected getStreamParserType(): StreamParserType {
    return 'text';
  }

  protected buildArgs(prompt: string, options?: ExecuteOptions): string[] {
    // Start with non-interactive mode
    const args = ['-p', prompt];

    // Use silent mode to suppress statistics and get clean output
    args.push('--silent');

    // Auto-approve all tools (required for non-interactive mode)
    args.push('--allow-all-tools');

    // Session resumption for chat mode
    // Use --continue to resume the most recent session automatically
    if (!options?.oneShot) {
      args.push('--continue');
    }

    // Debug mode
    if (this.isDebugMode()) {
      args.push('--log-level', 'debug');
    }

    return args;
  }

  protected processStreamData(
    data: unknown,
    context: { hasYieldedText: boolean; assistantContent: string; count: number },
  ): AgentMessage | AgentMessage[] | null {
    const line = String(data);

    // Skip lines based on shouldSkipLine logic
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      return null;
    }

    // Skip lines that look like statistics or metadata
    if (
      trimmed.startsWith('Total usage') ||
      trimmed.startsWith('Total duration') ||
      trimmed.startsWith('Total code changes') ||
      trimmed.startsWith('Usage by model') ||
      trimmed.match(/^\w+\s+\d+[\w\s,]+\(Est\./)
    ) {
      return null;
    }

    // Check for progress indicators
    // Match any text ending with (...) or (...).
    const match = line.match(/\(([^)]+)\)[.]?$/);
    const progressAction = match ? match[1].trim() : null;

    // Remove progress indicator from line content if present
    let contentLine = line;
    if (progressAction) {
      contentLine = line.replace(/\s*\([^)]+\)[.]?$/, '').trim();
    }

    // Add line to assistant content (with newline if not first emitted line)
    const lineWithNewline = context.hasYieldedText ? `\n${contentLine}` : contentLine;

    return {
      type: 'text',
      content: lineWithNewline,
      streamMode: 'append',
      metadata: progressAction
        ? {
            isProgress: true,
            progressAction,
          }
        : undefined,
    };
  }

  protected override extractSessionId(_line: string): string | null {
    // Copilot CLI in silent mode doesn't output session IDs in stdout
    // Session management is handled internally by the CLI
    // We could potentially parse from logs or config, but for now
    // we rely on --resume without explicit session ID
    return null;
  }

  protected override onCompactionComplete(): void {
    // After compaction, reset session so next execution starts fresh
    this.sessionId = null;
  }

  protected override getInterruptedSuffix(): string {
    return '\n\n[Interrupted by user]';
  }
}
