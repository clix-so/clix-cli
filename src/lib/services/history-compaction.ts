import type { AgentExecutor, ConversationMessage } from '../executor';

/**
 * Claude Sonnet 4.5 context window: 200,000 tokens
 *
 * Compaction threshold: 90% of context window
 * (Claude Code triggers auto-compact when context is "near limit")
 *
 * Using character count as a proxy for tokens (roughly 4 chars per token).
 * 200K tokens * 0.9 * 4 chars/token = 720,000 chars
 */
export const CLAUDE_SONNET_CONTEXT_WINDOW = 200000; // tokens
export const COMPRESSION_THRESHOLD_RATIO = 0.9; // 90% of context window (Claude Code style)
export const CHARS_PER_TOKEN = 4; // approximate

export const DEFAULT_COMPACTION_THRESHOLD =
  CLAUDE_SONNET_CONTEXT_WINDOW * COMPRESSION_THRESHOLD_RATIO * CHARS_PER_TOKEN; // 720,000 chars

/**
 * Fraction of recent history to preserve during compaction.
 * 0.3 means keep the last 30% of history intact.
 */
export const COMPACTION_PRESERVE_RATIO = 0.3;

/**
 * Maximum summary length in characters.
 */
export const MAX_SUMMARY_LENGTH = 4000;

export interface CompactionResult {
  compacted: boolean;
  originalLength: number;
  newLength: number;
  messagesCompacted: number;
  messagesPreserved: number;
}

export interface CompactionOptions {
  force?: boolean;
  threshold?: number;
  preserveRatio?: number;
}

/**
 * Calculates the total character count of the history.
 */
export function calculateHistorySize(history: ConversationMessage[]): number {
  return history.reduce((acc, msg) => acc + msg.content.length, 0);
}

/**
 * Finds the split point for compaction.
 * Returns the index where we should start preserving messages.
 */
export function findCompactionSplitPoint(
  history: ConversationMessage[],
  preserveRatio: number,
): number {
  if (history.length === 0) return 0;
  if (preserveRatio <= 0 || preserveRatio >= 1) {
    throw new Error('Preserve ratio must be between 0 and 1');
  }

  const charCounts = history.map((msg) => msg.content.length);
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  const targetCharsToCompress = totalChars * (1 - preserveRatio);

  let cumulativeChars = 0;
  let lastValidSplitPoint = 0;

  for (let i = 0; i < history.length; i++) {
    // Only split on user messages to maintain conversation pairs
    if (history[i].role === 'user') {
      if (cumulativeChars >= targetCharsToCompress) {
        return i;
      }
      lastValidSplitPoint = i;
    }
    cumulativeChars += charCounts[i];
  }

  // If we couldn't find a good split point after threshold, use last valid one
  return lastValidSplitPoint;
}

/**
 * Generates a compression prompt for the agent to summarize history.
 */
export function generateCompressionPrompt(historyToCompress: ConversationMessage[]): string {
  const conversationText = historyToCompress
    .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
    .join('\n\n');

  return `You are a conversation summarizer. Your task is to create a concise summary of the following conversation that captures:
1. Key topics discussed
2. Important decisions made
3. Any code or technical details mentioned
4. User preferences or requirements expressed

Keep the summary under ${MAX_SUMMARY_LENGTH} characters. Focus on information that would be useful for continuing the conversation.

<conversation>
${conversationText}
</conversation>

Provide only the summary, no additional commentary.`;
}

/**
 * Service for compacting conversation history when it gets too long.
 */
export class HistoryCompactionService {
  private threshold: number;
  private preserveRatio: number;

  constructor(options?: { threshold?: number; preserveRatio?: number }) {
    this.threshold = options?.threshold ?? DEFAULT_COMPACTION_THRESHOLD;
    this.preserveRatio = options?.preserveRatio ?? COMPACTION_PRESERVE_RATIO;
  }

  /**
   * Checks if the history needs compaction based on size.
   */
  needsCompaction(history: ConversationMessage[]): boolean {
    return calculateHistorySize(history) >= this.threshold;
  }

  /**
   * Compacts the history by summarizing older messages.
   * Returns the new compacted history.
   */
  async compact(
    history: ConversationMessage[],
    executor: AgentExecutor,
    options?: CompactionOptions,
  ): Promise<{ newHistory: ConversationMessage[]; result: CompactionResult }> {
    const originalSize = calculateHistorySize(history);
    const threshold = options?.threshold ?? this.threshold;
    const preserveRatio = options?.preserveRatio ?? this.preserveRatio;

    // Check if compaction is needed
    if (!options?.force && originalSize < threshold) {
      return {
        newHistory: history,
        result: {
          compacted: false,
          originalLength: originalSize,
          newLength: originalSize,
          messagesCompacted: 0,
          messagesPreserved: history.length,
        },
      };
    }

    // Don't compact if history is too short
    if (history.length < 4) {
      return {
        newHistory: history,
        result: {
          compacted: false,
          originalLength: originalSize,
          newLength: originalSize,
          messagesCompacted: 0,
          messagesPreserved: history.length,
        },
      };
    }

    // Find split point
    const splitPoint = findCompactionSplitPoint(history, preserveRatio);

    if (splitPoint === 0) {
      return {
        newHistory: history,
        result: {
          compacted: false,
          originalLength: originalSize,
          newLength: originalSize,
          messagesCompacted: 0,
          messagesPreserved: history.length,
        },
      };
    }

    const historyToCompress = history.slice(0, splitPoint);
    const historyToKeep = history.slice(splitPoint);

    // Generate summary using the executor
    const compressionPrompt = generateCompressionPrompt(historyToCompress);
    let summary = '';

    try {
      // Temporarily clear history to avoid recursion
      const savedHistory = executor.getHistory();
      executor.clearHistory();

      for await (const message of executor.execute(compressionPrompt)) {
        if (message.type === 'text') {
          summary += message.content;
        }
      }

      // Restore original history
      executor.setHistory(savedHistory);
    } catch (error) {
      // If summarization fails, return original history
      console.error('Compaction failed:', error);
      return {
        newHistory: history,
        result: {
          compacted: false,
          originalLength: originalSize,
          newLength: originalSize,
          messagesCompacted: 0,
          messagesPreserved: history.length,
        },
      };
    }

    // Truncate summary if too long
    if (summary.length > MAX_SUMMARY_LENGTH) {
      summary = `${summary.slice(0, MAX_SUMMARY_LENGTH)}...`;
    }

    // Create new compacted history
    const newHistory: ConversationMessage[] = [
      {
        role: 'user',
        content: `[Previous conversation summary]\n${summary}`,
      },
      {
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation.',
      },
      ...historyToKeep,
    ];

    const newSize = calculateHistorySize(newHistory);

    return {
      newHistory,
      result: {
        compacted: true,
        originalLength: originalSize,
        newLength: newSize,
        messagesCompacted: historyToCompress.length,
        messagesPreserved: historyToKeep.length,
      },
    };
  }
}

// Singleton instance
let compactionService: HistoryCompactionService | null = null;

export function getCompactionService(): HistoryCompactionService {
  if (!compactionService) {
    compactionService = new HistoryCompactionService();
  }
  return compactionService;
}
