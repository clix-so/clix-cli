import meow from 'meow';
import { agentCommand } from './commands/agent';
import { doctorCommand } from './commands/doctor';
import { installCommand } from './commands/install';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { mcpCommand } from './commands/mcp';
import { setupCommand } from './commands/setup';
import { skillsCommand } from './commands/skills';
import { uninstallCommand } from './commands/uninstall';
import { updateCommand } from './commands/update';
import { whoamiCommand } from './commands/whoami';
import { setExitCode } from './lib/exit';
import { checkFirstRun, shouldRunSetup } from './lib/services/first-run-service';

/**
 * Generate CLI help text.
 */
function generateHelpText(): string {
  return `
  Usage
    $ clix [command] [options]

  Commands
    (default)         Show this help message
    help              Show this help message
    login             Log in to Clix via browser
    logout            Log out from Clix
    whoami            Show current logged-in user
    agent [name]      List or switch AI agents
    install           Install Clix SDK (step-by-step setup + interactive agent handoff)
    doctor            Check Clix SDK integration status
    mcp               Install Clix MCP Server
    skills            Install Clix Skills
    uninstall         Uninstall Clix CLI from your system
    update            Check for available updates

  Options
    --help            Show this help message
    --version         Show version number

  Examples
    $ clix
    $ clix help
    $ clix login
    $ clix logout
    $ clix whoami
    $ clix agent
    $ clix agent claude
    $ clix install
    $ clix doctor
    $ clix mcp
    $ clix skills
`;
}

const cli = meow(generateHelpText(), {
  importMeta: import.meta,
  // Use build-time embedded version if available (for binary builds)
  ...(process.env.CLIX_VERSION && { version: process.env.CLIX_VERSION }),
  flags: {
    startTask: {
      type: 'string',
    },
    keepConfig: {
      type: 'boolean',
      default: false,
    },
    keepState: {
      type: 'boolean',
      default: false,
    },
    dryRun: {
      type: 'boolean',
      default: false,
    },
    force: {
      type: 'boolean',
      shortFlag: 'f',
      default: false,
    },
  },
});

async function main() {
  const command = cli.input[0];

  try {
    // Check if first-run setup is needed
    if (await shouldRunSetup(command)) {
      await setupCommand();
    }

    switch (command) {
      case 'help':
        cli.showHelp();
        break;

      case 'login':
        await loginCommand();
        break;

      case 'logout':
        await logoutCommand();
        break;

      case 'whoami':
        await whoamiCommand();
        break;

      case 'agent': {
        const targetAgent = cli.input[1];
        await agentCommand({ targetAgent });
        break;
      }

      case 'install': {
        const startTask = cli.flags.startTask;
        await installCommand({ startTask });
        break;
      }

      case 'doctor': {
        await doctorCommand();
        break;
      }

      case 'mcp':
        if (cli.input[1]) {
          console.error('mcp command does not accept positional arguments.');
          setExitCode(1);
          break;
        }
        await mcpCommand();
        break;

      case 'skills':
        await skillsCommand();
        break;

      case 'update':
      case 'upgrade':
        await updateCommand({
          dryRun: cli.flags.dryRun,
          force: cli.flags.force,
        });
        break;

      case 'uninstall':
        await uninstallCommand({
          keepConfig: cli.flags.keepConfig,
          keepState: cli.flags.keepState,
          dryRun: cli.flags.dryRun,
          force: cli.flags.force,
        });
        break;

      case 'setup': {
        const status = await checkFirstRun();
        if (status.needsSetup) {
          await setupCommand();
        } else {
          console.log('Project already configured.');
        }
        break;
      }

      default:
        if (command) {
          // Unknown command - show error message
          console.error(`Unknown command: ${command}`);
          console.error(`Run 'clix help' to see available commands.`);
          setExitCode(1);
        } else {
          // No command provided - show command help
          cli.showHelp();
        }
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    setExitCode(1);
  }
}

main().finally(() => {
  process.exit(process.exitCode ?? 0);
});
