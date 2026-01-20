import { describe, expect, test } from 'bun:test';
import {
  getMCPAgentDisplayName,
  installMCPServer,
  type MCPTargetAgent,
} from '../mcp-install-service';

describe('getMCPAgentDisplayName', () => {
  test('should return display name for claude', () => {
    expect(getMCPAgentDisplayName('claude')).toBe('Claude');
  });

  test('should return display name for codex', () => {
    expect(getMCPAgentDisplayName('codex')).toBe('Codex');
  });

  test('should return agent name as-is for unknown agent', () => {
    expect(getMCPAgentDisplayName('unknown' as unknown as MCPTargetAgent)).toBe('unknown');
  });
});

describe('installMCPServer for Claude', () => {
  test('should fail gracefully when claude CLI is not available', async () => {
    const result = await installMCPServer('claude');

    // Either succeeds (if claude is installed) or fails with proper error
    if (!result.success) {
      expect(result.message).toContain('Failed');
      expect(result.error).toBeDefined();
    } else {
      expect(result.message).toContain('Clix MCP Server installed for Claude Code');
    }
  });
});

describe('installMCPServer for Codex', () => {
  test('should succeed or fail gracefully when codex CLI is available/unavailable', async () => {
    const result = await installMCPServer('codex');

    // Either succeeds (if codex is installed) or fails with proper error
    if (!result.success) {
      expect(result.message).toContain('Failed');
      expect(result.error).toBeDefined();
    } else {
      expect(result.message).toMatch(/Clix MCP Server/);
    }
  });

  test('should include success message or already configured message', async () => {
    const result = await installMCPServer('codex');

    if (result.success) {
      // Either it was already configured or it was just installed
      expect(result.message).toMatch(/Clix MCP Server/);
      expect(result.message.toLowerCase()).toMatch(/installed|configured/);
    }
  });

  test('should handle re-installation gracefully', async () => {
    // First installation
    const result1 = await installMCPServer('codex');

    if (result1.success) {
      // Second installation should also succeed (either installs again or detects already configured)
      const result2 = await installMCPServer('codex');
      expect(result2.success).toBe(true);
    }
  });

  test('result should have proper structure after installation attempt', async () => {
    const result = await installMCPServer('codex');

    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('installMCPServer for unknown agent', () => {
  test('should return error for unknown agent', async () => {
    const result = await installMCPServer('unknown' as unknown as MCPTargetAgent);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown agent');
  });
});

describe('MCPTargetAgent type', () => {
  test('should accept "claude" as valid agent', () => {
    const agent: MCPTargetAgent = 'claude';
    expect(agent).toBe('claude');
  });

  test('should accept "codex" as valid agent', () => {
    const agent: MCPTargetAgent = 'codex';
    expect(agent).toBe('codex');
  });
});

describe('MCPInstallResult interface', () => {
  test('should have success, message, and optional error fields', async () => {
    const result = await installMCPServer('codex');

    expect('success' in result).toBe(true);
    expect('message' in result).toBe(true);
    // error is optional
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });
});
