interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Test fixtures for various test scenarios
 */
export const FIXTURES = {
  /**
   * A short conversation history (2 messages)
   */
  shortHistory: [
    { role: 'user' as const, content: 'Hello' },
    { role: 'assistant' as const, content: 'Hi there! How can I help you today?' },
  ] as ConversationMessage[],

  /**
   * A medium conversation history (6 messages)
   */
  mediumHistory: [
    { role: 'user' as const, content: 'What is TypeScript?' },
    {
      role: 'assistant' as const,
      content: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
    },
    { role: 'user' as const, content: 'How do I use interfaces?' },
    {
      role: 'assistant' as const,
      content:
        'Interfaces in TypeScript define the structure of objects. You use the interface keyword.',
    },
    { role: 'user' as const, content: 'Can you show me an example?' },
    {
      role: 'assistant' as const,
      content: 'Sure! Here is an example: interface User { name: string; age: number; }',
    },
  ] as ConversationMessage[],

  /**
   * A long conversation history (20 messages, ~10KB total)
   */
  longHistory: Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i + 1}: `.padEnd(500, `This is content for message ${i + 1}. `),
  })) as ConversationMessage[],

  /**
   * A very long conversation that should trigger compaction (~200KB)
   */
  compactionTriggerHistory: Array.from({ length: 100 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i + 1}: `.padEnd(2000, `This is extended content for message ${i + 1}. `),
  })) as ConversationMessage[],

  /**
   * Mock configuration object
   */
  mockConfig: {
    selectedAgent: 'claude',
    lastUsedAt: '2024-01-01T00:00:00.000Z',
  },

  /**
   * Empty configuration
   */
  emptyConfig: {
    selectedAgent: '',
  },

  /**
   * Mock MCP server configuration
   */
  mockMCPConfig: {
    mcpServers: {
      'clix-mcp-server': {
        command: 'npx',
        args: ['-y', '@clix-so/clix-mcp-server'],
      },
    },
  },

  /**
   * Mock debug problem descriptions
   */
  debugProblems: {
    simple: 'The app crashes on startup',
    detailed:
      'Push notifications are not being received on iOS devices after the user grants permission. This started happening after updating to version 2.0.',
    empty: '',
  },

  /**
   * Mock skill types
   */
  skillTypes: [
    'integration',
    'event-tracking',
    'user-management',
    'personalization',
    'doctor',
  ] as const,

  /**
   * Mock platform types
   */
  platforms: ['ios', 'android', 'react-native', 'flutter'] as const,
};

/**
 * Calculate total character count of a history array
 */
export function calculateHistorySize(history: ConversationMessage[]): number {
  return history.reduce((sum, msg) => sum + msg.content.length, 0);
}
