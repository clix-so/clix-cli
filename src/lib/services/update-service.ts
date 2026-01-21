/**
 * Update service for checking and executing CLI updates.
 *
 * @module services/update-service
 */

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { VERSION } from '../version';
import { gt as semverGt, valid as semverValid } from './semver';

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    console.error(`[update-service] ${message}`, data ?? '');
  }
}

/**
 * Supported installation methods.
 */
export type InstallationMethod =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  | 'homebrew'
  | 'binary'
  | 'unknown';

/**
 * Installation information.
 */
export interface InstallationInfo {
  method: InstallationMethod;
  isGlobal: boolean;
}

/**
 * Result of an update check.
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  error?: string;
}

/**
 * Result of an update execution.
 */
export interface UpdateExecutionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Options for update command.
 */
export interface UpdateOptions {
  dryRun: boolean;
  force: boolean;
}

/**
 * Update plan with all necessary information.
 */
export interface UpdatePlan {
  installMethod: InstallationMethod;
  currentVersion: string;
  latestVersion: string;
  updateCommand: string;
  canAutoUpdate: boolean;
  hasUpdate: boolean;
}

/**
 * NPM registry response structure.
 */
interface NpmRegistryResponse {
  version: string;
  name?: string;
}

/**
 * Get the current package version.
 */
function getCurrentVersion(): string {
  return VERSION;
}

/**
 * Detect how the CLI was installed.
 */
export async function detectInstallationMethod(): Promise<InstallationInfo> {
  const execPath = process.argv[1] || '';

  // Resolve symlinks to get the real path (for npm global installs)
  let realPath = execPath;
  try {
    realPath = realpathSync(execPath);
  } catch {
    // If realpath fails, use the original path
    realPath = execPath;
  }

  debugLog('Detecting installation method', { execPath, realPath });

  // Check for Homebrew installation (macOS)
  if (execPath.includes('/opt/homebrew/') || execPath.includes('/usr/local/Cellar/')) {
    debugLog('Detected homebrew installation');
    return { method: 'homebrew', isGlobal: true };
  }

  // Check for Bun global installation
  if (realPath.includes('.bun/install/global') || realPath.includes('/.bun/bin/')) {
    debugLog('Detected bun global installation');
    return { method: 'bun', isGlobal: true };
  }

  // Check for pnpm global installation
  if (realPath.includes('pnpm/global') || realPath.includes('.pnpm/')) {
    debugLog('Detected pnpm installation');
    return { method: 'pnpm', isGlobal: realPath.includes('global') };
  }

  // Check for yarn global installation
  if (realPath.includes('.yarn/') || realPath.includes('yarn/global')) {
    debugLog('Detected yarn installation');
    return { method: 'yarn', isGlobal: true };
  }

  // Check for npm global installation (use realPath to resolve symlinks)
  if (realPath.includes('node_modules')) {
    const isGlobal =
      realPath.includes('/lib/node_modules/') ||
      realPath.includes('/npm/node_modules/') ||
      realPath.includes('AppData/Roaming/npm');
    debugLog('Detected npm installation', { isGlobal });
    return { method: 'npm', isGlobal };
  }

  // Check if running from source (development)
  if (process.env.DEV === 'true' || execPath.includes('/src/cli.tsx')) {
    debugLog('Detected development mode');
    return { method: 'unknown', isGlobal: false };
  }

  // Binary or unknown installation
  debugLog('Detected binary/unknown installation');
  return { method: 'binary', isGlobal: true };
}

/**
 * Check if we should perform an update check based on last check time.
 * Rate limits to once per 24 hours.
 *
 * @param lastCheckTime - ISO timestamp of last check
 * @returns True if enough time has passed
 */
export function shouldCheckForUpdate(lastCheckTime?: string): boolean {
  if (!lastCheckTime) {
    return true;
  }

  try {
    const lastCheck = new Date(lastCheckTime);
    // Check for invalid date
    if (Number.isNaN(lastCheck.getTime())) {
      return true;
    }
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= 24;
  } catch {
    return true;
  }
}

/**
 * Check for available updates from npm registry.
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns Update check result
 */
export async function checkForUpdate(timeout = 2000): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();

  debugLog('Checking for updates', { currentVersion, timeout });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://registry.npmjs.org/@clix-so/clix-cli/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as NpmRegistryResponse;
    const latestVersion = data.version;

    if (!semverValid(latestVersion) || !semverValid(currentVersion)) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: null,
        error: 'Invalid version format',
      };
    }

    const hasUpdate = semverGt(latestVersion, currentVersion);

    debugLog('Update check complete', { currentVersion, latestVersion, hasUpdate });

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'Request timed out'
          : error.message
        : 'Unknown error';

    debugLog('Update check failed', { error: errorMessage });

    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      error: errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the appropriate update command for the installation method.
 *
 * @param info - Installation information
 * @returns Update command string
 */
export function getUpdateCommand(info: InstallationInfo): string {
  switch (info.method) {
    case 'npm':
      return info.isGlobal
        ? 'npm install -g @clix-so/clix-cli@latest'
        : 'npm update @clix-so/clix-cli';
    case 'yarn':
      return info.isGlobal
        ? 'yarn global add @clix-so/clix-cli@latest'
        : 'yarn upgrade @clix-so/clix-cli';
    case 'pnpm':
      return info.isGlobal
        ? 'pnpm add -g @clix-so/clix-cli@latest'
        : 'pnpm update @clix-so/clix-cli';
    case 'bun':
      return info.isGlobal ? 'bun add -g @clix-so/clix-cli@latest' : 'bun update @clix-so/clix-cli';
    case 'homebrew':
      return 'brew upgrade clix-so/clix-cli/clix';
    case 'binary':
      return 'curl -fsSL https://cli.clix.so/install.sh | bash';
    default:
      return 'npm install -g @clix-so/clix-cli@latest';
  }
}

/**
 * Execute an update using the update plan.
 *
 * @param plan - Update plan from planUpdate()
 * @param options - Update options (dryRun, force)
 * @returns Execution result
 */
export async function executeUpdate(
  plan: UpdatePlan,
  options: UpdateOptions,
): Promise<UpdateExecutionResult> {
  debugLog('Executing update', { method: plan.installMethod, command: plan.updateCommand });

  // Dry run - don't actually execute
  if (options.dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would execute: ${plan.updateCommand}`,
    };
  }

  // Binary/unknown installations can't be auto-updated
  if (!plan.canAutoUpdate) {
    return {
      success: false,
      message: `Auto-update not supported for ${plan.installMethod} installation.\nPlease run manually:\n  ${plan.updateCommand}`,
    };
  }

  try {
    // For binary installations, use CLIX_VERSION environment variable
    const env =
      plan.installMethod === 'binary'
        ? { ...process.env, CLIX_VERSION: `v${plan.latestVersion}` }
        : process.env;

    const [cmd, ...args] = plan.updateCommand.split(' ');

    return new Promise((resolve) => {
      const updateProcess = spawn(cmd, args, {
        stdio: 'inherit',
        shell: true,
        env,
      });

      updateProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: `Successfully updated to ${plan.latestVersion}`,
          });
        } else {
          resolve({
            success: false,
            message: `Update failed with exit code ${code}`,
            error: `Exit code: ${code}`,
          });
        }
      });

      updateProcess.on('error', (err) => {
        debugLog('Update execution failed', { error: err.message });
        resolve({
          success: false,
          message: `Failed to execute update: ${err.message}`,
          error: err.message,
        });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    debugLog('Update execution failed', { error: errorMessage });

    return {
      success: false,
      message: `Failed to start update: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Check if an update is available and return a formatted message.
 *
 * @param result - Update check result
 * @param info - Installation information
 * @returns Formatted update message or null if no update
 */
export function formatUpdateMessage(
  result: UpdateCheckResult,
  info: InstallationInfo,
): string | null {
  if (!result.hasUpdate || !result.latestVersion) {
    return null;
  }

  const command = getUpdateCommand(info);

  return `Update available: ${result.currentVersion} -> ${result.latestVersion}\nRun: ${command}`;
}

/**
 * Create an update plan by checking for updates and detecting installation method.
 *
 * @returns Update plan with all necessary information
 */
export async function planUpdate(): Promise<UpdatePlan> {
  const [updateResult, installInfo] = await Promise.all([
    checkForUpdate(5000),
    detectInstallationMethod(),
  ]);

  // binary는 CLIX_VERSION 환경변수로 자동 업데이트 가능
  const canAutoUpdate = installInfo.method !== 'unknown';

  return {
    installMethod: installInfo.method,
    currentVersion: updateResult.currentVersion,
    latestVersion: updateResult.latestVersion ?? updateResult.currentVersion,
    updateCommand: getUpdateCommand(installInfo),
    canAutoUpdate,
    hasUpdate: updateResult.hasUpdate,
  };
}
