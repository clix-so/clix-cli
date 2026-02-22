import meow from 'meow';
import { agentCommand } from './commands/agent';
import { doctorCommand } from './commands/doctor';
import { installCommand } from './commands/install';
import { installMCPCommand } from './commands/install-mcp';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { setupCommand } from './commands/setup';
import { uninstallCommand } from './commands/uninstall';
import { updateCommand } from './commands/update';
import { whoamiCommand } from './commands/whoami';
import { checkFirstRun, shouldRunSetup } from './lib/services/first-run-service';
import {
  getValidMCPAgents,
  isValidMCPAgent,
  type MCPTargetAgent,
} from './lib/services/mcp-install-service';

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
    install           Install Clix SDK (step-by-step setup + one-shot execution)
    doctor            Check Clix SDK integration status
    install-mcp [agent]  Install Clix MCP Server
    uninstall         Uninstall Clix CLI from your system
    update            Check for available updates

  Options
    --help            Show this help message
    --version         Show version number
    --platform <val>  Target platform (ios, android, react-native, flutter)

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
    $ clix install-mcp
    $ clix install-mcp claude
`;
}

const cli = meow(generateHelpText(), {
  importMeta: import.meta,
  // Use build-time embedded version if available (for binary builds)
  ...(process.env.CLIX_VERSION && { version: process.env.CLIX_VERSION }),
  flags: {
    platform: {
      type: 'string',
    },
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
        const platform = cli.flags.platform as
          | 'ios'
          | 'android'
          | 'react-native'
          | 'flutter'
          | undefined;
        const startTask = cli.flags.startTask;
        await installCommand({ platform, startTask });
        break;
      }

      case 'doctor': {
        const platform = cli.flags.platform as
          | 'ios'
          | 'android'
          | 'react-native'
          | 'flutter'
          | undefined;
        await doctorCommand({ platform });
        break;
      }

      case 'install-mcp': {
        const agentInput = cli.input[1];
        const validAgents = getValidMCPAgents();
        if (agentInput && !isValidMCPAgent(agentInput)) {
          console.error(`Unknown agent: ${agentInput}`);
          console.error(`Supported agents: ${validAgents.join(', ')}`);
          process.exit(1);
        }
        const agent = agentInput as MCPTargetAgent | undefined;
        await installMCPCommand({ agent });
        break;
      }

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
          process.exit(1);
        } else {
          // No command provided - show command help
          cli.showHelp();
        }
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
