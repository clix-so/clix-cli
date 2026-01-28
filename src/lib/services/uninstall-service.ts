/**
 * Uninstall service for removing Clix CLI from the system.
 *
 * @module services/uninstall-service
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { xdg } from '../utils/xdg';
import { detectInstallationMethod, type InstallationMethod } from './update-service';

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    console.error(`[uninstall-service] ${message}`, data ?? '');
  }
}

/**
 * Options for uninstall operation.
 */
export interface UninstallOptions {
  /** Keep configuration files */
  keepConfig: boolean;
  /** Keep state/session files */
  keepState: boolean;
  /** Dry run - don't actually delete anything */
  dryRun: boolean;
  /** Force uninstall without confirmation */
  force: boolean;
}

/**
 * Information about a directory.
 */
export interface DirectoryInfo {
  /** Full path to the directory/file */
  path: string;
  /** Whether it exists on the filesystem */
  exists: boolean;
  /** Size in bytes */
  size: number;
  /** Human-readable size (e.g., "1.2 MB") */
  humanSize: string;
}

/**
 * Uninstall execution plan.
 */
export interface UninstallPlan {
  /** Detected installation method */
  installMethod: InstallationMethod;
  /** Binary location (if standalone) */
  binary: DirectoryInfo | null;
  /** Config directory */
  configDir: DirectoryInfo;
  /** State directory */
  stateDir: DirectoryInfo;
  /** Legacy directory (pre-XDG) */
  legacyDir: DirectoryInfo | null;
  /** Shell config files that need cleaning */
  shellConfigsToClean: string[];
  /** Recommended uninstall command */
  uninstallCommand: string | null;
  /** Warnings to display */
  warnings: string[];
}

/**
 * Result of uninstall execution.
 */
export interface UninstallResult {
  /** Success status */
  success: boolean;
  /** Items that were removed */
  removed: string[];
  /** Items that were kept */
  kept: string[];
  /** Errors encountered */
  errors: string[];
}

/**
 * Get the size of a directory or file.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const stat = await fs.stat(dirPath);

    if (!stat.isDirectory()) {
      return stat.size;
    }

    let totalSize = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      } else {
        const fileStat = await fs.stat(fullPath);
        totalSize += fileStat.size;
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Format bytes into human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / k ** i;

  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Get directory information.
 */
async function getDirectoryInfo(dirPath: string): Promise<DirectoryInfo> {
  try {
    await fs.access(dirPath);
    const size = await getDirectorySize(dirPath);
    return {
      path: dirPath,
      exists: true,
      size,
      humanSize: formatSize(size),
    };
  } catch {
    return {
      path: dirPath,
      exists: false,
      size: 0,
      humanSize: '0 B',
    };
  }
}

/**
 * Get the uninstall command for the installation method.
 */
export function getUninstallCommand(method: InstallationMethod): string | null {
  switch (method) {
    case 'npm':
      return 'npm uninstall -g @clix-so/clix-cli';
    case 'yarn':
      return 'yarn global remove @clix-so/clix-cli';
    case 'pnpm':
      return 'pnpm remove -g @clix-so/clix-cli';
    case 'bun':
      return 'bun remove -g @clix-so/clix-cli';
    case 'homebrew':
      return 'brew uninstall clix-so/clix-cli/clix';
    case 'binary':
      return 'curl -fsSL https://clix.sh/uninstall.sh | bash';
    default:
      return null;
  }
}

/**
 * Detect shell config files that may contain PATH configuration.
 */
function detectShellConfigs(): string[] {
  const home = os.homedir();
  const shellName = path.basename(process.env.SHELL ?? 'bash');
  const configs: string[] = [];

  switch (shellName) {
    case 'zsh':
      configs.push(path.join(home, '.zshrc'));
      break;
    case 'bash':
      configs.push(
        path.join(home, '.bashrc'),
        path.join(home, '.bash_profile'),
        path.join(home, '.profile'),
      );
      break;
    case 'fish':
      configs.push(path.join(home, '.config/fish/config.fish'));
      break;
    default:
      // For unknown shells, check common config files
      configs.push(
        path.join(home, '.bashrc'),
        path.join(home, '.bash_profile'),
        path.join(home, '.profile'),
        path.join(home, '.zshrc'),
      );
      break;
  }

  return configs;
}

/**
 * Check if a shell config file has clix PATH configuration.
 */
async function hasClixPathConfig(configPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return content.includes('# clix');
  } catch {
    return false;
  }
}

/**
 * Get shell config files that need cleaning.
 */
async function getShellConfigsToClean(): Promise<string[]> {
  const configs = detectShellConfigs();
  const toClean: string[] = [];

  for (const config of configs) {
    if (await hasClixPathConfig(config)) {
      toClean.push(config);
    }
  }

  return toClean;
}

/**
 * Plan the uninstall operation.
 */
export async function planUninstall(options: UninstallOptions): Promise<UninstallPlan> {
  debugLog('Planning uninstall', options);

  const installInfo = await detectInstallationMethod();
  const home = os.homedir();

  // Get directory information
  const configDir = await getDirectoryInfo(xdg.config());
  const stateDir = await getDirectoryInfo(xdg.state());
  const legacyPath = path.join(home, '.clix');
  const legacyDir = (await getDirectoryInfo(legacyPath)).exists
    ? await getDirectoryInfo(legacyPath)
    : null;

  // Binary location (only for binary installations)
  let binary: DirectoryInfo | null = null;
  if (installInfo.method === 'binary') {
    const binaryPath = path.join(home, '.local/bin/clix');
    binary = await getDirectoryInfo(binaryPath);
  }

  // Shell configs
  const shellConfigsToClean = await getShellConfigsToClean();

  // Warnings
  const warnings: string[] = [];

  // Binary installations can't delete themselves
  if (installInfo.method === 'binary' && binary?.exists) {
    warnings.push('Binary cannot delete itself while running');
  }

  // Package manager installations should use their uninstall command
  if (installInfo.method !== 'binary' && installInfo.method !== 'unknown') {
    warnings.push(`Recommended to uninstall via ${installInfo.method}`);
  }

  const uninstallCommand = getUninstallCommand(installInfo.method);

  return {
    installMethod: installInfo.method,
    binary,
    configDir,
    stateDir,
    legacyDir,
    shellConfigsToClean,
    uninstallCommand,
    warnings,
  };
}

/**
 * Clean clix PATH configuration from a shell config file.
 */
async function cleanShellConfig(configPath: string, dryRun: boolean): Promise<boolean> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const lines = content.split('\n');
    const newLines: string[] = [];
    let skipNext = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip marker line and the next line (export/set PATH)
      if (line.includes('# clix')) {
        skipNext = true;
        continue;
      }

      if (skipNext && (line.includes('export PATH=') || line.includes('set -gx PATH'))) {
        skipNext = false;
        continue;
      }

      skipNext = false;
      newLines.push(line);
    }

    if (!dryRun) {
      await fs.writeFile(configPath, newLines.join('\n'));
    }

    return true;
  } catch (error) {
    debugLog('Failed to clean shell config', { configPath, error });
    return false;
  }
}

/**
 * Remove a directory or file.
 */
async function removePathSafely(targetPath: string, dryRun: boolean): Promise<boolean> {
  try {
    if (!dryRun) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
    return true;
  } catch (error) {
    debugLog('Failed to remove path', { targetPath, error });
    return false;
  }
}

/**
 * Execute the uninstall operation.
 */
export async function executeUninstall(
  plan: UninstallPlan,
  options: UninstallOptions,
): Promise<UninstallResult> {
  debugLog('Executing uninstall', { plan, options });

  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  // Remove binary (only for binary installations)
  if (plan.binary?.exists) {
    if (options.dryRun) {
      removed.push(plan.binary.path);
    } else {
      // Binary can't delete itself
      errors.push(`Cannot delete binary while running: ${plan.binary.path}`);
      kept.push(plan.binary.path);
    }
  }

  // Remove config directory
  if (plan.configDir.exists && !options.keepConfig) {
    const success = await removePathSafely(plan.configDir.path, options.dryRun);
    if (success) {
      removed.push(plan.configDir.path);
    } else {
      errors.push(`Failed to remove: ${plan.configDir.path}`);
    }
  } else if (plan.configDir.exists) {
    kept.push(plan.configDir.path);
  }

  // Remove state directory
  if (plan.stateDir.exists && !options.keepState) {
    const success = await removePathSafely(plan.stateDir.path, options.dryRun);
    if (success) {
      removed.push(plan.stateDir.path);
    } else {
      errors.push(`Failed to remove: ${plan.stateDir.path}`);
    }
  } else if (plan.stateDir.exists) {
    kept.push(plan.stateDir.path);
  }

  // Remove legacy directory
  if (plan.legacyDir?.exists && !options.keepConfig) {
    const success = await removePathSafely(plan.legacyDir.path, options.dryRun);
    if (success) {
      removed.push(plan.legacyDir.path);
    } else {
      errors.push(`Failed to remove: ${plan.legacyDir.path}`);
    }
  }

  // Clean shell configs
  for (const configPath of plan.shellConfigsToClean) {
    const success = await cleanShellConfig(configPath, options.dryRun);
    if (success) {
      removed.push(`PATH config in ${configPath}`);
    } else {
      errors.push(`Failed to clean: ${configPath}`);
    }
  }

  return {
    success: errors.length === 0,
    removed,
    kept,
    errors,
  };
}
