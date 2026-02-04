import { getCredentialsManager } from '../auth/credentials';
import { getProjectConfigManager } from '../config/project-config-manager';

/**
 * Result of first-run detection.
 */
export interface FirstRunStatus {
  /** Whether setup is needed (no project config) */
  needsSetup: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether project config exists */
  hasProjectConfig: boolean;
}

/**
 * Commands that don't require project setup.
 * These can run without a .clix/config.jsonc file.
 */
export const SETUP_EXEMPT_COMMANDS = [
  'help',
  'login',
  'logout',
  'update',
  'upgrade',
  'uninstall',
  'version',
  '--help',
  '--version',
  '-h',
  '-v',
] as const;

/**
 * Check if a command is exempt from first-run setup.
 *
 * @param command - Command name to check
 * @returns True if command doesn't require setup
 */
export function isSetupExemptCommand(command: string | undefined): boolean {
  if (!command) {
    return false; // Default (interactive mode) requires setup
  }
  return SETUP_EXEMPT_COMMANDS.includes(command as (typeof SETUP_EXEMPT_COMMANDS)[number]);
}

/**
 * Check the first-run status for the current project.
 * Determines if setup flow should be triggered.
 *
 * @param projectPath - Optional project path (defaults to cwd)
 * @returns FirstRunStatus indicating what setup is needed
 *
 * @example
 * ```typescript
 * const status = await checkFirstRun();
 * if (status.needsSetup) {
 *   await runSetupFlow();
 * }
 * ```
 */
export async function checkFirstRun(projectPath?: string): Promise<FirstRunStatus> {
  const credentialsManager = getCredentialsManager();
  const projectConfigManager = getProjectConfigManager(projectPath);

  // Check authentication status
  const isAuthenticated = await credentialsManager.isAuthenticated();

  // Check if project config exists
  const hasProjectConfig = await projectConfigManager.exists();

  // Setup is needed if project config doesn't exist
  const needsSetup = !hasProjectConfig;

  return {
    needsSetup,
    isAuthenticated,
    hasProjectConfig,
  };
}

/**
 * Check if the current project needs setup before running a command.
 * Combines command exemption check with first-run detection.
 *
 * @param command - Command being run
 * @param projectPath - Optional project path
 * @returns True if setup should be run before the command
 */
export async function shouldRunSetup(
  command: string | undefined,
  projectPath?: string,
): Promise<boolean> {
  // Skip setup if explicitly disabled (for CI/testing)
  if (process.env.CLIX_SKIP_SETUP === '1' || process.env.CLIX_SKIP_SETUP === 'true') {
    return false;
  }

  // Skip setup for exempt commands
  if (isSetupExemptCommand(command)) {
    return false;
  }

  const status = await checkFirstRun(projectPath);
  return status.needsSetup;
}
