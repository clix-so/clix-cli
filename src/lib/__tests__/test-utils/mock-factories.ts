import { mock } from 'bun:test';
import type { AgentInfo } from '../../agents';
import type { AgentExecutor, AgentMessage } from '../../executor';

/**
 * Creates a mock AgentExecutor for testing.
 */
export function createMockExecutor(overrides?: Partial<AgentExecutor>): AgentExecutor {
  return {
    name: 'mock',
    isAvailable: mock(async () => true),
    execute: mock(async function* (_prompt: string): AsyncGenerator<AgentMessage> {
      yield { type: 'text', content: 'Mock response' };
      yield { type: 'complete', content: '' };
    }),
    ...overrides,
  };
}

/**
 * Creates a mock AgentInfo object for testing.
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
 * Creates an executor that yields specific messages for testing.
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
