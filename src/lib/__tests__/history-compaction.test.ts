import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { AgentMessage, ConversationMessage } from '../executor';
import {
  COMPACTION_PRESERVE_RATIO,
  calculateHistorySize,
  DEFAULT_COMPACTION_THRESHOLD,
  findCompactionSplitPoint,
  generateCompressionPrompt,
  getCompactionService,
  HistoryCompactionService,
  MAX_SUMMARY_LENGTH,
} from '../services/history-compaction';
import {
  createMockExecutor,
  createMockExecutorWithResponses,
  createMockHistory,
  FIXTURES,
} from './test-utils';

describe('calculateHistorySize', () => {
  test('should return 0 for empty history', () => {
    expect(calculateHistorySize([])).toBe(0);
  });

  test('should sum up content lengths for all messages', () => {
    const size = calculateHistorySize(FIXTURES.shortHistory);
    // 'Hello' (5) + 'Hi there! How can I help you today?' (35) = 40
    expect(size).toBe(40);
  });

  test('should handle single message', () => {
    const size = calculateHistorySize([{ role: 'user', content: 'test' }]);
    expect(size).toBe(4);
  });

  test('should correctly calculate size for long history', () => {
    const size = calculateHistorySize(FIXTURES.longHistory);
    // Each message is ~500 chars, 20 messages
    expect(size).toBeGreaterThan(9000);
  });
});

describe('findCompactionSplitPoint', () => {
  test('should return 0 for empty history', () => {
    expect(findCompactionSplitPoint([], 0.3)).toBe(0);
  });

  test('should throw error for invalid preserve ratio (0)', () => {
    expect(() => findCompactionSplitPoint(FIXTURES.shortHistory, 0)).toThrow(
      'Preserve ratio must be between 0 and 1',
    );
  });

  test('should throw error for invalid preserve ratio (1)', () => {
    expect(() => findCompactionSplitPoint(FIXTURES.shortHistory, 1)).toThrow(
      'Preserve ratio must be between 0 and 1',
    );
  });

  test('should throw error for invalid preserve ratio (negative)', () => {
    expect(() => findCompactionSplitPoint(FIXTURES.shortHistory, -0.5)).toThrow(
      'Preserve ratio must be between 0 and 1',
    );
  });

  test('should throw error for invalid preserve ratio (>1)', () => {
    expect(() => findCompactionSplitPoint(FIXTURES.shortHistory, 1.5)).toThrow(
      'Preserve ratio must be between 0 and 1',
    );
  });

  test('should find split point on user message boundary', () => {
    const history = createMockHistory(10, 100);
    const splitPoint = findCompactionSplitPoint(history, 0.3);
    // Split should be on a user message (even index)
    expect(splitPoint % 2).toBe(0);
  });

  test('should preserve approximately the expected ratio of content', () => {
    const history = createMockHistory(20, 100);
    const preserveRatio = 0.3;
    const splitPoint = findCompactionSplitPoint(history, preserveRatio);

    const totalSize = calculateHistorySize(history);
    const preservedSize = calculateHistorySize(history.slice(splitPoint));

    // The preserved portion should be roughly around the preserve ratio
    const actualRatio = preservedSize / totalSize;
    expect(actualRatio).toBeGreaterThanOrEqual(0.2);
    expect(actualRatio).toBeLessThanOrEqual(0.5);
  });
});

describe('generateCompressionPrompt', () => {
  test('should include all messages in the prompt', () => {
    const prompt = generateCompressionPrompt(FIXTURES.shortHistory);

    expect(prompt).toContain('[USER]: Hello');
    expect(prompt).toContain('[ASSISTANT]: Hi there! How can I help you today?');
  });

  test('should include max summary length instruction', () => {
    const prompt = generateCompressionPrompt(FIXTURES.shortHistory);
    expect(prompt).toContain(`${MAX_SUMMARY_LENGTH} characters`);
  });

  test('should include conversation tags', () => {
    const prompt = generateCompressionPrompt(FIXTURES.shortHistory);
    expect(prompt).toContain('<conversation>');
    expect(prompt).toContain('</conversation>');
  });

  test('should include key summarization instructions', () => {
    const prompt = generateCompressionPrompt(FIXTURES.shortHistory);
    expect(prompt).toContain('Key topics discussed');
    expect(prompt).toContain('Important decisions made');
    expect(prompt).toContain('code or technical details');
    expect(prompt).toContain('User preferences or requirements');
  });
});

describe('HistoryCompactionService', () => {
  let service: HistoryCompactionService;
  let mockExecutor: ReturnType<typeof createMockExecutor>;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
  });

  describe('constructor', () => {
    test('should use default threshold and preserve ratio', () => {
      service = new HistoryCompactionService();
      // Small history shouldn't need compaction with default threshold
      expect(service.needsCompaction(FIXTURES.shortHistory)).toBe(false);
    });

    test('should accept custom threshold', () => {
      service = new HistoryCompactionService({ threshold: 10 });
      // Even short history should need compaction with tiny threshold
      expect(service.needsCompaction(FIXTURES.shortHistory)).toBe(true);
    });

    test('should accept custom preserve ratio', () => {
      service = new HistoryCompactionService({
        threshold: 10,
        preserveRatio: 0.5,
      });
      expect(service.needsCompaction(FIXTURES.shortHistory)).toBe(true);
    });
  });

  describe('needsCompaction', () => {
    test('should return false when history is below threshold', () => {
      service = new HistoryCompactionService({ threshold: 100000 });
      expect(service.needsCompaction(FIXTURES.shortHistory)).toBe(false);
    });

    test('should return true when history is at or above threshold', () => {
      service = new HistoryCompactionService({ threshold: 30 });
      expect(service.needsCompaction(FIXTURES.shortHistory)).toBe(true);
    });

    test('should return false for empty history', () => {
      service = new HistoryCompactionService({ threshold: 10 });
      expect(service.needsCompaction([])).toBe(false);
    });
  });

  describe('compact', () => {
    test('should not compact when below threshold', async () => {
      service = new HistoryCompactionService({ threshold: 100000 });
      const { newHistory, result } = await service.compact(FIXTURES.mediumHistory, mockExecutor);

      expect(result.compacted).toBe(false);
      expect(newHistory).toEqual(FIXTURES.mediumHistory);
      expect(result.messagesCompacted).toBe(0);
      expect(result.messagesPreserved).toBe(FIXTURES.mediumHistory.length);
    });

    test('should not compact history with fewer than 4 messages', async () => {
      service = new HistoryCompactionService({ threshold: 10 });
      const { newHistory, result } = await service.compact(FIXTURES.shortHistory, mockExecutor);

      expect(result.compacted).toBe(false);
      expect(newHistory).toEqual(FIXTURES.shortHistory);
    });

    test('should compact when force option is true', async () => {
      service = new HistoryCompactionService({ threshold: 100000 });

      const summaryExecutor = createMockExecutorWithResponses([
        { type: 'text', content: 'Summary of the conversation' },
        { type: 'complete', content: '' },
      ]);

      const { newHistory, result } = await service.compact(
        FIXTURES.mediumHistory,
        summaryExecutor,
        { force: true },
      );

      expect(result.compacted).toBe(true);
      expect(newHistory.length).toBeLessThan(FIXTURES.mediumHistory.length);
    });

    test('should compress older messages and preserve recent ones', async () => {
      service = new HistoryCompactionService({ threshold: 10, preserveRatio: 0.5 });

      const summaryExecutor = createMockExecutorWithResponses([
        { type: 'text', content: 'Compressed summary' },
        { type: 'complete', content: '' },
      ]);

      const { newHistory, result } = await service.compact(
        FIXTURES.mediumHistory,
        summaryExecutor,
        { force: true },
      );

      expect(result.compacted).toBe(true);
      // New history should have summary + acknowledgment + preserved messages
      expect(newHistory.length).toBeGreaterThanOrEqual(3);
      // First message should be the summary
      expect(newHistory[0].role).toBe('user');
      expect(newHistory[0].content).toContain('[Previous conversation summary]');
    });

    test('should handle executor errors gracefully', async () => {
      service = new HistoryCompactionService({ threshold: 10 });

      const errorExecutor = createMockExecutor({
        // biome-ignore lint/correctness/useYield: Test intentionally throws before yielding
        execute: mock(async function* (): AsyncGenerator<AgentMessage> {
          throw new Error('Executor error');
        }),
      });

      // Mock console.error to prevent test noise
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

      const { newHistory, result } = await service.compact(FIXTURES.mediumHistory, errorExecutor, {
        force: true,
      });

      expect(result.compacted).toBe(false);
      expect(newHistory).toEqual(FIXTURES.mediumHistory);

      consoleSpy.mockRestore();
    });

    test('should truncate summary if too long', async () => {
      service = new HistoryCompactionService({ threshold: 10 });

      // Create an executor that returns a very long summary
      const longSummary = 'x'.repeat(MAX_SUMMARY_LENGTH + 1000);
      const longSummaryExecutor = createMockExecutorWithResponses([
        { type: 'text', content: longSummary },
        { type: 'complete', content: '' },
      ]);

      const { newHistory, result } = await service.compact(
        FIXTURES.mediumHistory,
        longSummaryExecutor,
        { force: true },
      );

      expect(result.compacted).toBe(true);
      // Summary should be truncated with ...
      const summaryContent = newHistory[0].content;
      expect(summaryContent.length).toBeLessThanOrEqual(
        MAX_SUMMARY_LENGTH + '[Previous conversation summary]\n'.length + 10,
      );
    });

    test('should include acknowledgment message after summary', async () => {
      service = new HistoryCompactionService({ threshold: 10 });

      const summaryExecutor = createMockExecutorWithResponses([
        { type: 'text', content: 'Test summary' },
        { type: 'complete', content: '' },
      ]);

      const { newHistory } = await service.compact(FIXTURES.mediumHistory, summaryExecutor, {
        force: true,
      });

      expect(newHistory[1].role).toBe('assistant');
      expect(newHistory[1].content).toContain('context from our previous conversation');
    });

    test('should respect custom threshold in options', async () => {
      service = new HistoryCompactionService({ threshold: 100000 });

      const summaryExecutor = createMockExecutorWithResponses([
        { type: 'text', content: 'Summary' },
        { type: 'complete', content: '' },
      ]);

      // Use small threshold in options to force compaction
      const { result } = await service.compact(FIXTURES.mediumHistory, summaryExecutor, {
        threshold: 10,
      });

      expect(result.compacted).toBe(true);
    });

    test('should clear and restore executor history during compression', async () => {
      service = new HistoryCompactionService({ threshold: 10 });

      const originalHistory: ConversationMessage[] = [
        { role: 'user', content: 'Original message' },
      ];

      const summaryExecutor = createMockExecutor({
        execute: mock(async function* (): AsyncGenerator<AgentMessage> {
          yield { type: 'text', content: 'Summary' };
          yield { type: 'complete', content: '' };
        }),
      });

      summaryExecutor.setHistory(originalHistory);

      await service.compact(FIXTURES.mediumHistory, summaryExecutor, { force: true });

      // History should be restored after compression
      expect(summaryExecutor.getHistory).toHaveBeenCalled();
      expect(summaryExecutor.setHistory).toHaveBeenCalled();
    });
  });
});

describe('getCompactionService', () => {
  test('should return a singleton instance', () => {
    const service1 = getCompactionService();
    const service2 = getCompactionService();
    expect(service1).toBe(service2);
  });

  test('should return a HistoryCompactionService instance', () => {
    const service = getCompactionService();
    expect(service).toBeInstanceOf(HistoryCompactionService);
  });
});

describe('Constants', () => {
  test('DEFAULT_COMPACTION_THRESHOLD should be calculated correctly', () => {
    // 200000 * 0.9 * 4 = 720000
    expect(DEFAULT_COMPACTION_THRESHOLD).toBe(720000);
  });

  test('COMPACTION_PRESERVE_RATIO should be 0.3', () => {
    expect(COMPACTION_PRESERVE_RATIO).toBe(0.3);
  });

  test('MAX_SUMMARY_LENGTH should be 4000', () => {
    expect(MAX_SUMMARY_LENGTH).toBe(4000);
  });
});
