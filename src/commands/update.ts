/**
 * CLI update command - checks for and displays update information.
 *
 * @module commands/update
 */

import {
  checkForUpdate,
  detectInstallationMethod,
  getUpdateCommand,
} from '../lib/services/update-service';

/**
 * Check for updates and display information.
 */
export async function updateCommand(): Promise<void> {
  console.log('Checking for updates...\n');

  try {
    const [updateResult, installInfo] = await Promise.all([
      checkForUpdate(5000), // Use a longer timeout for CLI
      detectInstallationMethod(),
    ]);

    if (updateResult.error) {
      console.error(`Failed to check for updates: ${updateResult.error}`);
      process.exit(1);
    }

    if (!updateResult.hasUpdate) {
      console.log(`You're on the latest version (${updateResult.currentVersion})`);
      return;
    }

    const updateCmd = getUpdateCommand(installInfo);
    console.log(
      `Update available: ${updateResult.currentVersion} -> ${updateResult.latestVersion}`,
    );
    console.log(`\nTo update, run:\n  ${updateCmd}\n`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to check for updates: ${errorMessage}`);
    process.exit(1);
  }
}
