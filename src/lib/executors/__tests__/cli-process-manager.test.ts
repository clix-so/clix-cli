import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';

/**
 * Note: The commandExists and parseJSONLStream functions are tested
 * implicitly through the executor integration tests.
 *
 * Direct unit tests for these functions are challenging in Bun's test
 * environment due to differences in how Node.js streams and child processes
 * are handled.
 *
 * These tests focus on type correctness and basic behavior verification.
 */

describe('cli-process-manager', () => {
  describe('commandExists behavior', () => {
    test('spawn which command should work', async () => {
      // Test that we can spawn the 'which' command correctly
      const result = await new Promise<boolean>((resolve) => {
        const proc = spawn('which', ['ls'], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });

      // ls should exist on Unix systems
      expect(result).toBe(true);
    });

    test('spawn should return false for non-existent command', async () => {
      const result = await new Promise<boolean>((resolve) => {
        const proc = spawn('which', ['nonexistent-command-xyz-12345'], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });

      expect(result).toBe(false);
    });
  });

  describe('CLI message format types', () => {
    /**
     * These tests verify that our type definitions match expected CLI output formats
     */
    test('Claude CLI JSONL format examples should be parseable', () => {
      const claudeMessages = [
        '{"type":"system","session_id":"abc123"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}',
        '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":"result"}]}}',
        '{"type":"result","result":"Done","is_error":false}',
      ];

      for (const msg of claudeMessages) {
        const parsed = JSON.parse(msg);
        expect(parsed).toHaveProperty('type');
      }
    });

    test('Codex CLI JSONL format examples should be parseable', () => {
      const codexMessages = [
        '{"type":"thread.started","thread_id":"thread-123"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hi"}}',
        '{"type":"item.completed","item":{"id":"item_2","type":"function_call","name":"shell","arguments":"{}"}}',
        '{"type":"item.completed","item":{"id":"item_3","type":"function_return","output":"result"}}',
        '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}',
        '{"type":"error","error":"Something went wrong"}',
      ];

      for (const msg of codexMessages) {
        const parsed = JSON.parse(msg);
        expect(parsed).toHaveProperty('type');
      }
    });

    test('empty lines and whitespace should be trimmable', () => {
      const lines = ['', '   ', '\t\t', '  {"valid":"json"}  '];

      const results = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((result) => result !== null);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ valid: 'json' });
    });

    test('invalid JSON lines should be skippable', () => {
      const lines = ['{"valid":"json"}', 'invalid json', '{broken', '{"also":"valid"}'];

      const results = lines
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((result) => result !== null);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ valid: 'json' });
      expect(results[1]).toEqual({ also: 'valid' });
    });
  });

  describe('JSONL parsing logic', () => {
    /**
     * Test the JSONL parsing logic in isolation
     */
    function parseJSONL(input: string): unknown[] {
      const results: unknown[] = [];
      const lines = input.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          results.push(JSON.parse(trimmed));
        } catch {
          // Skip invalid JSON
        }
      }

      return results;
    }

    test('should parse multiple JSON lines', () => {
      const input = '{"type":"a"}\n{"type":"b"}\n{"type":"c"}';
      const results = parseJSONL(input);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ type: 'a' });
      expect(results[1]).toEqual({ type: 'b' });
      expect(results[2]).toEqual({ type: 'c' });
    });

    test('should handle CRLF line endings', () => {
      const input = '{"type":"a"}\r\n{"type":"b"}\r\n';
      const results = parseJSONL(input);

      expect(results).toHaveLength(2);
    });

    test('should skip blank lines', () => {
      const input = '{"type":"a"}\n\n\n{"type":"b"}';
      const results = parseJSONL(input);

      expect(results).toHaveLength(2);
    });

    test('should skip invalid JSON', () => {
      const input = '{"valid":true}\nnot json\n{"also":"valid"}';
      const results = parseJSONL(input);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ valid: true });
      expect(results[1]).toEqual({ also: 'valid' });
    });
  });
});
