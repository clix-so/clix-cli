/**
 * CLI uninstall command - removes Clix CLI from the system.
 *
 * @module commands/uninstall
 */

import readline from 'node:readline/promises';
import {
  executeUninstall,
  planUninstall,
  type UninstallOptions,
} from '../lib/services/uninstall-service';

/**
 * Display the uninstall plan to the user.
 */
function displayUninstallPlan(
  plan: Awaited<ReturnType<typeof planUninstall>>,
  options: UninstallOptions,
): void {
  console.log('\n=== Uninstall Plan ===\n');

  console.log(`Installation method: ${plan.installMethod}`);

  if (plan.uninstallCommand && plan.installMethod !== 'binary') {
    console.log(`\nRecommended uninstall command:`);
    console.log(`  ${plan.uninstallCommand}`);
    console.log(
      `\nNote: Using the package manager's uninstall command is recommended for ${plan.installMethod} installations.`,
    );
    console.log(`This command will only clean up configuration and state files.\n`);
  }

  console.log('\nItems to be removed:');

  if (plan.binary?.exists && !options.dryRun) {
    console.log(`  ⚠️  Binary: ${plan.binary.path} (cannot delete while running)`);
  } else if (plan.binary?.exists) {
    console.log(`  🗑️  Binary: ${plan.binary.path}`);
  }

  if (!options.keepConfig) {
    if (plan.configDir.exists) {
      console.log(`  🗑️  Config: ${plan.configDir.path} (${plan.configDir.humanSize})`);
    }
    if (plan.legacyDir?.exists) {
      console.log(`  🗑️  Legacy: ${plan.legacyDir.path} (${plan.legacyDir.humanSize})`);
    }
  }

  if (!options.keepState && plan.stateDir.exists) {
    console.log(`  🗑️  State: ${plan.stateDir.path} (${plan.stateDir.humanSize})`);
  }

  if (plan.shellConfigsToClean.length > 0) {
    console.log(`  🗑️  PATH config in shell files:`);
    for (const config of plan.shellConfigsToClean) {
      console.log(`      - ${config}`);
    }
  }

  console.log('\nItems to be kept:');

  if (options.keepConfig && plan.configDir.exists) {
    console.log(`  ✓ Config: ${plan.configDir.path}`);
  }

  if (options.keepState && plan.stateDir.exists) {
    console.log(`  ✓ State: ${plan.stateDir.path}`);
  }

  if (!plan.configDir.exists && !plan.stateDir.exists && !plan.legacyDir?.exists) {
    console.log('  (No config or state files found)');
  }

  if (plan.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
  }

  console.log('');
}

/**
 * Display the uninstall result.
 */
function displayUninstallResult(
  result: Awaited<ReturnType<typeof executeUninstall>>,
  plan: Awaited<ReturnType<typeof planUninstall>>,
): void {
  console.log('\n=== Uninstall Complete ===\n');

  if (result.removed.length > 0) {
    console.log('Removed:');
    for (const item of result.removed) {
      console.log(`  ✓ ${item}`);
    }
    console.log('');
  }

  if (result.kept.length > 0) {
    console.log('Kept:');
    for (const item of result.kept) {
      console.log(`  - ${item}`);
    }
    console.log('');
  }

  if (result.errors.length > 0) {
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  ✗ ${error}`);
    }
    console.log('');
  }

  // Additional instructions
  if (plan.binary?.exists && plan.installMethod === 'binary') {
    console.log('To complete the uninstall, run:');
    console.log(`  rm ${plan.binary.path}`);
    console.log('');
    console.log('Or use the uninstall script:');
    console.log('  curl -fsSL https://cli.clix.so/uninstall.sh | bash');
    console.log('');
  }

  if (plan.installMethod !== 'binary' && plan.uninstallCommand) {
    console.log('To complete the uninstall, run:');
    console.log(`  ${plan.uninstallCommand}`);
    console.log('');
  }
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
 * Execute the uninstall command.
 */
export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  try {
    // Plan the uninstall
    const plan = await planUninstall(options);

    // Display the plan
    displayUninstallPlan(plan, options);

    // Dry run - stop here
    if (options.dryRun) {
      console.log('[DRY RUN] No changes were made.\n');
      return;
    }

    // Confirm with user
    if (!options.force) {
      const confirmed = await promptConfirmation('Proceed with uninstall?');
      if (!confirmed) {
        console.log('\nUninstall cancelled.\n');
        return;
      }
    }

    // Execute the uninstall
    const result = await executeUninstall(plan, options);

    // Display the result
    displayUninstallResult(result, plan);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\nFailed to uninstall: ${errorMessage}\n`);
    process.exit(1);
  }
}
