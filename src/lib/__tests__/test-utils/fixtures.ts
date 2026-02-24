/**
 * Test fixtures for various test scenarios
 */
export const FIXTURES = {
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
