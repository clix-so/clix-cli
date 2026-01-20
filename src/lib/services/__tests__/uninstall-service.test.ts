import { describe, expect, test } from 'bun:test';
import { formatSize, getUninstallCommand } from '../uninstall-service';

describe('formatSize', () => {
  test('should format 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  test('should format bytes', () => {
    expect(formatSize(100)).toBe('100.0 B');
    expect(formatSize(1023)).toBe('1023.0 B');
  });

  test('should format kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(10240)).toBe('10.0 KB');
  });

  test('should format megabytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(5242880)).toBe('5.0 MB');
  });

  test('should format gigabytes', () => {
    expect(formatSize(1073741824)).toBe('1.0 GB');
    expect(formatSize(2147483648)).toBe('2.0 GB');
  });
});

describe('getUninstallCommand', () => {
  test('should return npm command for npm installation', () => {
    const cmd = getUninstallCommand('npm');
    expect(cmd).toBe('npm uninstall -g @clix-so/clix-cli');
  });

  test('should return yarn command for yarn installation', () => {
    const cmd = getUninstallCommand('yarn');
    expect(cmd).toBe('yarn global remove @clix-so/clix-cli');
  });

  test('should return pnpm command for pnpm installation', () => {
    const cmd = getUninstallCommand('pnpm');
    expect(cmd).toBe('pnpm remove -g @clix-so/clix-cli');
  });

  test('should return bun command for bun installation', () => {
    const cmd = getUninstallCommand('bun');
    expect(cmd).toBe('bun remove -g @clix-so/clix-cli');
  });

  test('should return brew command for homebrew installation', () => {
    const cmd = getUninstallCommand('homebrew');
    expect(cmd).toBe('brew uninstall clix-so/clix-cli/clix');
  });

  test('should return uninstall script for binary installation', () => {
    const cmd = getUninstallCommand('binary');
    expect(cmd).toContain('curl -fsSL');
    expect(cmd).toContain('uninstall.sh');
  });

  test('should return null for unknown installation', () => {
    const cmd = getUninstallCommand('unknown');
    expect(cmd).toBeNull();
  });
});
