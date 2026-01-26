import meow from 'meow';
import { agentCommand } from './commands/agent';
import { chatCommand } from './commands/chat';
import { debugCommand } from './commands/debug';
import { installMCPCommand } from './commands/install-mcp';
import { iosSetupCommand } from './commands/ios-setup/index';
import { resumeCommand } from './commands/resume';
import { skillCommand } from './commands/skill/index';
import { uninstallCommand } from './commands/uninstall';
import { updateCommand } from './commands/update';
import {
  getValidMCPAgents,
  isValidMCPAgent,
  type MCPTargetAgent,
} from './lib/services/mcp-install-service';
import { getAvailableSkills, getAvailableSkillTypes } from './lib/skills';

/**
 * Generate help text dynamically based on available skills.
 */
function generateHelpText(): string {
  const skills = getAvailableSkills();
  const localSkills = skills.filter((s) => s.isLocal);

  // Generate local skill commands (command-line mode only)
  const localSkillCommands = localSkills
    .map((s) => `    ${s.type.padEnd(17)} ${s.description}`)
    .join('\n');

  return `
  Usage
    $ clix [command] [options]

  Commands
    (default)         Start interactive chat with AI agent
    help              Show this help message
    agent [name]      List or switch AI agents
${localSkillCommands}
    debug <problem>   Interactive debugging assistant
    install-mcp [agent]  Install Clix MCP Server
    resume            Resume a previous session
    uninstall         Uninstall Clix CLI from your system
    update            Check for available updates

  Options
    --help            Show this help message
    --version         Show version number
    --platform <val>  Target platform (ios, android, react-native, flutter)

  Examples
    $ clix
    $ clix help
    $ clix agent
    $ clix agent claude
    $ clix resume
    $ clix install
    $ clix doctor
    $ clix debug "Push notifications not working on iOS"
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
    interactive: {
      type: 'boolean',
      default: false,
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
    // iOS setup flags
    apiKey: {
      type: 'string',
    },
    keyId: {
      type: 'string',
    },
    issuerId: {
      type: 'string',
    },
    bundleId: {
      type: 'string',
    },
    skipPortal: {
      type: 'boolean',
      default: false,
    },
    pushEnv: {
      type: 'string',
    },
  },
});

async function main() {
  const command = cli.input[0];

  // Get available skill types dynamically
  const skillTypes = getAvailableSkillTypes();

  try {
    switch (command) {
      case 'help':
        cli.showHelp();
        break;

      case 'agent': {
        const targetAgent = cli.input[1];
        await agentCommand({ targetAgent });
        break;
      }

      case 'debug': {
        const problem = cli.input.slice(1).join(' ');
        await debugCommand({ problem });
        break;
      }

      case 'resume': {
        await resumeCommand();
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

      case 'ios-setup':
      case 'capabilities':
      case 'ios-capabilities': {
        const pushEnvRaw = cli.flags.pushEnv;
        if (pushEnvRaw && !['development', 'production'].includes(pushEnvRaw)) {
          console.error(`Invalid --push-env value: ${pushEnvRaw}`);
          console.error('Expected: development | production');
          process.exit(1);
        }
        const pushEnv = pushEnvRaw as 'development' | 'production' | undefined;
        await iosSetupCommand({
          apiKeyPath: cli.flags.apiKey,
          keyId: cli.flags.keyId,
          issuerId: cli.flags.issuerId,
          bundleId: cli.flags.bundleId,
          skipPortal: cli.flags.skipPortal,
          pushEnvironment: pushEnv,
        });
        break;
      }

      default:
        // Check if command is a skill type (dynamically)
        if (skillTypes.includes(command ?? '')) {
          const platform = cli.flags.platform as
            | 'ios'
            | 'android'
            | 'react-native'
            | 'flutter'
            | undefined;
          await skillCommand({ action: command, platform });
        } else if (command) {
          // Unknown command - show error message
          console.error(`Unknown command: ${command}`);
          console.error(`Run 'clix help' to see available commands.`);
          process.exit(1);
        } else {
          // No command provided - start interactive chat TUI
          await chatCommand();
        }
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
