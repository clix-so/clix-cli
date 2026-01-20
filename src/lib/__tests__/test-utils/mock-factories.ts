import { mock } from 'bun:test';
import type { AgentInfo } from '../../agents';
import type {
  AgentExecutor,
  AgentMessage,
  CompactionResult,
  ConversationMessage,
} from '../../executor';

/**
 * Creates a mock AgentExecutor for testing
 */
export function createMockExecutor(overrides?: Partial<AgentExecutor>): AgentExecutor {
  const mockHistory: ConversationMessage[] = [];
  let mockSessionId: string | null = null;

  return {
    name: 'mock',
    isAvailable: mock(async () => true),
    execute: mock(async function* (_prompt: string): AsyncGenerator<AgentMessage> {
      yield { type: 'text', content: 'Mock response' };
      yield { type: 'complete', content: '' };
    }),
    clearHistory: mock(() => {
      mockHistory.length = 0;
    }),
    getHistory: mock(() => [...mockHistory]),
    setHistory: mock((history: ConversationMessage[]) => {
      mockHistory.length = 0;
      mockHistory.push(...history);
    }),
    getSessionId: mock(() => mockSessionId),
    setSessionId: mock((id: string | null) => {
      mockSessionId = id;
    }),
    needsCompaction: mock(() => false),
    compactHistory: mock(
      async (): Promise<CompactionResult> => ({
        compacted: false,
        originalLength: 0,
        newLength: 0,
        messagesCompacted: 0,
        messagesPreserved: 0,
      }),
    ),
    resetSession: mock(() => {}),
    ...overrides,
  };
}

/**
 * Creates a mock AgentInfo object for testing
 */
export function createMockAgent(overrides?: Partial<AgentInfo>): AgentInfo {
  return {
    name: 'mock-agent',
    command: 'mock',
    displayName: 'Mock Agent',
    description: 'A mock agent for testing',
    installUrl: 'https://example.com',
    sdkPackage: '@mock/sdk',
    ...overrides,
  };
}

/**
 * Creates a single mock ConversationMessage
 */
export function createMockMessage(overrides?: Partial<ConversationMessage>): ConversationMessage {
  return {
    role: 'user',
    content: 'Test message',
    ...overrides,
  };
}

/**
 * Creates a mock conversation history with alternating user/assistant messages
 * @param count Number of messages to create
 * @param contentMultiplier Multiplier for content length (default 100 chars per message)
 */
export function createMockHistory(
  count: number,
  contentMultiplier: number = 100,
): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i + 1} `.repeat(Math.ceil(contentMultiplier / 10)),
  }));
}

/**
 * Creates an executor that yields specific messages for testing
 */
export function createMockExecutorWithResponses(responses: AgentMessage[]): AgentExecutor {
  return createMockExecutor({
    execute: mock(async function* (): AsyncGenerator<AgentMessage> {
      for (const response of responses) {
        yield response;
      }
    }),
  });
}
