/**
 * CLI update command - checks for and executes updates.
 *
 * @module commands/update
 */

import readline from 'node:readline/promises';
import { setExitCode } from '../lib/exit';
import {
  executeUpdate,
  planUpdate,
  type UpdateOptions,
  type UpdatePlan,
} from '../lib/services/update-service';

/**
 * Display the update plan to the user.
 */
function displayUpdatePlan(plan: UpdatePlan): void {
  console.log('\n=== Update Plan ===\n');

  console.log(`Installation method: ${plan.installMethod}`);
  console.log(`Current version: ${plan.currentVersion}`);
  console.log(`Latest version: ${plan.latestVersion}`);

  if (!plan.hasUpdate) {
    console.log('\nYou are already on the latest version.');
    return;
  }

  console.log(`\nUpdate command: ${plan.updateCommand}`);

  if (!plan.canAutoUpdate) {
    console.log('\nNote: Auto-update is not supported for this installation method.');
    console.log(`Please run manually:\n  ${plan.updateCommand}`);
  }

  console.log('');
}

/**
 * Display the update result.
 */
function displayUpdateResult(
  result: Awaited<ReturnType<typeof executeUpdate>>,
  plan: UpdatePlan,
): void {
  console.log('\n=== Update Result ===\n');

  if (result.success) {
    console.log(`✓ ${result.message}`);
  } else {
    console.log(`✗ ${result.message}`);
    if (!plan.canAutoUpdate) {
      console.log(`\nTo update manually, run:\n  ${plan.updateCommand}`);
    }
  }
  console.log('');
}

/**
 * Prompt user for confirmation.
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Execute the update command.
 */
export async function updateCommand(
  options: UpdateOptions = { dryRun: false, force: false },
): Promise<void> {
  console.log('Checking for updates...\n');

  try {
    // Plan the update (checks for updates and detects installation method)
    const plan = await planUpdate();

    // Check for update-check errors (network/registry failures)
    if (plan.error) {
      console.error(`Failed to check for updates: ${plan.error}`);
      setExitCode(1);
      return;
    }

    // No update available
    if (!plan.hasUpdate) {
      console.log(`You're on the latest version (${plan.currentVersion})`);
      return;
    }

    // Display the plan
    displayUpdatePlan(plan);

    // Can't auto-update - stop here
    if (!plan.canAutoUpdate) {
      return;
    }

    // Dry run - stop here
    if (options.dryRun) {
      console.log('[DRY RUN] No changes were made.\n');
      return;
    }

    // Confirm with user
    if (!options.force) {
      const confirmed = await promptConfirmation(
        `Update from ${plan.currentVersion} to ${plan.latestVersion}?`,
      );
      if (!confirmed) {
        console.log('\nUpdate cancelled.\n');
        return;
      }
    }

    // Execute the update
    console.log('\nUpdating...\n');
    const result = await executeUpdate(plan, options);

    // Display the result
    displayUpdateResult(result, plan);

    if (!result.success) {
      setExitCode(1);
      return;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\nFailed to update: ${errorMessage}\n`);
    setExitCode(1);
  }
}
