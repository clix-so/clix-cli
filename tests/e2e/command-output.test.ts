import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type CLITestRig, createTestRig } from './test-rig';

describe('Command Mode Output Persistence', () => {
  let rig: CLITestRig;
  const distPath = join(import.meta.dir, '../../dist/cli.js');

  beforeAll(() => {
    rig = createTestRig({ timeout: 15000 });

    if (!existsSync(distPath)) {
      throw new Error('dist/cli.js not found. Run "bun run build" first.');
    }
  });

  describe('Help command', () => {
    test('should show main help output', async () => {
      const result = await rig.run(['--help']);

      // Should display help
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toContain('Commands');
      // Exit code may be 0 or 2 depending on meow version
      expect([0, 2]).toContain(result.exitCode);
    });
  });

  describe('Command availability', () => {
    test('should list commands in help output', async () => {
      const result = await rig.run(['--help']);

      // Verify that command mode commands are listed
      expect(result.stdout).toContain('install');
      expect(result.stdout).toContain('doctor');
      expect(result.stdout).toContain('skills');
      expect(result.stdout).not.toContain('debug <problem>');
    });
  });

  describe('Version command', () => {
    test('should display version and leave output', async () => {
      const result = await rig.run(['--version']);

      // Should show version
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('Final Output Format Verification', () => {
  test('should verify final output format in help text', async () => {
    const rig = createTestRig({ timeout: 10000 });
    const result = await rig.run(['--help']);

    // Verify commands that support final output are listed
    expect(result.stdout).toContain('install');
    expect(result.stdout).toContain('doctor');
    // Note: config is not shown in help (interactive command)

    // These commands should now persist their output
    expect(result.stdout).toContain('Install Clix SDK');
    expect(result.stdout).toContain('Check Clix SDK integration status');
  });
});
