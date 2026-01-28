import { describe, expect, test } from 'bun:test';
import {
  executeUpdate,
  getUpdateCommand,
  shouldCheckForUpdate,
  type UpdatePlan,
} from '../update-service';

describe('shouldCheckForUpdate', () => {
  test('should return true if lastCheckTime is undefined', () => {
    expect(shouldCheckForUpdate(undefined)).toBe(true);
  });

  test('should return true if lastCheckTime is empty string', () => {
    expect(shouldCheckForUpdate('')).toBe(true);
  });

  test('should return true if more than 24 hours have passed', () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 25);
    expect(shouldCheckForUpdate(pastDate.toISOString())).toBe(true);
  });

  test('should return false if checked within 24 hours', () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 1);
    expect(shouldCheckForUpdate(recentDate.toISOString())).toBe(false);
  });

  test('should return true for invalid date string', () => {
    expect(shouldCheckForUpdate('invalid-date')).toBe(true);
  });
});

describe('getUpdateCommand', () => {
  test('should return npm command for npm global installation', () => {
    const cmd = getUpdateCommand({ method: 'npm', isGlobal: true });
    expect(cmd).toBe('npm install -g @clix-so/clix-cli@latest');
  });

  test('should return npm update command for npm local installation', () => {
    const cmd = getUpdateCommand({ method: 'npm', isGlobal: false });
    expect(cmd).toBe('npm update @clix-so/clix-cli');
  });

  test('should return bun command for bun installation', () => {
    const cmd = getUpdateCommand({ method: 'bun', isGlobal: true });
    expect(cmd).toBe('bun add -g @clix-so/clix-cli@latest');
  });

  test('should return yarn command for yarn global installation', () => {
    const cmd = getUpdateCommand({ method: 'yarn', isGlobal: true });
    expect(cmd).toBe('yarn global add @clix-so/clix-cli@latest');
  });

  test('should return pnpm command for pnpm global installation', () => {
    const cmd = getUpdateCommand({ method: 'pnpm', isGlobal: true });
    expect(cmd).toBe('pnpm add -g @clix-so/clix-cli@latest');
  });

  test('should return brew command for homebrew installation', () => {
    const cmd = getUpdateCommand({ method: 'homebrew', isGlobal: true });
    expect(cmd).toBe('brew upgrade clix-so/clix-cli/clix');
  });

  test('should return install script for binary installation', () => {
    const cmd = getUpdateCommand({ method: 'binary', isGlobal: true });
    expect(cmd).toContain('curl -fsSL');
    expect(cmd).toContain('install');
  });

  test('should return npm command as fallback for unknown installation', () => {
    const cmd = getUpdateCommand({ method: 'unknown', isGlobal: true });
    expect(cmd).toBe('npm install -g @clix-so/clix-cli@latest');
  });
});

describe('executeUpdate', () => {
  const basePlan: UpdatePlan = {
    installMethod: 'npm',
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    updateCommand: 'npm install -g @clix-so/clix-cli@latest',
    canAutoUpdate: true,
    hasUpdate: true,
    error: undefined,
  };

  test('should return dry run message when dryRun is true', async () => {
    const result = await executeUpdate(basePlan, { dryRun: true, force: false });
    expect(result.success).toBe(true);
    expect(result.message).toContain('DRY RUN');
    expect(result.message).toContain(basePlan.updateCommand);
  });

  test('should return dry run message for binary installation', async () => {
    const binaryPlan: UpdatePlan = {
      ...basePlan,
      installMethod: 'binary',
      canAutoUpdate: true,
      updateCommand: 'curl -fsSL https://clix.sh/install | bash',
    };
    // Binary installations now support auto-update via CLIX_VERSION env var
    const result = await executeUpdate(binaryPlan, { dryRun: true, force: false });
    expect(result.success).toBe(true);
    expect(result.message).toContain('DRY RUN');
    expect(result.message).toContain(binaryPlan.updateCommand);
  });

  test('should return failure for unknown installation', async () => {
    const unknownPlan: UpdatePlan = {
      ...basePlan,
      installMethod: 'unknown',
      canAutoUpdate: false,
    };
    const result = await executeUpdate(unknownPlan, { dryRun: false, force: false });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Auto-update not supported');
  });

  test('should return failure with dry-run prefix for unknown installation when dryRun is true', async () => {
    const unknownPlan: UpdatePlan = {
      ...basePlan,
      installMethod: 'unknown',
      canAutoUpdate: false,
    };
    // Dry-run should also fail for unsupported installations (reflects real execution behavior)
    const result = await executeUpdate(unknownPlan, { dryRun: true, force: false });
    expect(result.success).toBe(false);
    expect(result.message).toContain('DRY RUN');
    expect(result.message).toContain('Auto-update not supported');
  });
});
