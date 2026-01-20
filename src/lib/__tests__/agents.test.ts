import { describe, expect, test } from 'bun:test';
import { detectAvailableAgents, getAgentByName, SUPPORTED_AGENTS } from '../agents';

describe('Agents', () => {
  test('should have supported agents defined', () => {
    expect(SUPPORTED_AGENTS).toBeDefined();
    expect(SUPPORTED_AGENTS.length).toBeGreaterThan(0);
  });

  test('should include expected agents', () => {
    const agentNames = SUPPORTED_AGENTS.map((a) => a.name);

    expect(agentNames).toContain('claude');
    expect(agentNames).toContain('codex');
  });

  test('getAgentByName should return agent when found', () => {
    const agent = getAgentByName('claude');

    expect(agent).toBeDefined();
    expect(agent?.name).toBe('claude');
    expect(agent?.command).toBe('claude');
    expect(agent?.displayName).toBe('Claude');
    expect(agent?.installUrl).toBeDefined();
    expect(agent?.sdkPackage).toBe('@anthropic-ai/claude-agent-sdk');
  });

  test('getAgentByName should return codex agent', () => {
    const agent = getAgentByName('codex');

    expect(agent).toBeDefined();
    expect(agent?.name).toBe('codex');
    expect(agent?.command).toBe('codex');
    expect(agent?.displayName).toBe('Codex');
    expect(agent?.installUrl).toBeDefined();
    expect(agent?.sdkPackage).toBe('@openai/codex-sdk');
  });

  test('getAgentByName should return undefined for unknown agent', () => {
    const agent = getAgentByName('unknown-agent');

    expect(agent).toBeUndefined();
  });

  test('detectAvailableAgents should return array', async () => {
    const agents = await detectAvailableAgents();

    expect(Array.isArray(agents)).toBe(true);
    // Each agent should have required properties
    for (const agent of agents) {
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('command');
      expect(agent).toHaveProperty('displayName');
      expect(agent).toHaveProperty('installUrl');
      expect(agent).toHaveProperty('sdkPackage');
    }
  });
});
