import { detectAvailableAgents, getAgentByName, SUPPORTED_AGENTS } from '../lib/agents';
import { ConfigManager } from '../lib/config/index';

interface AgentCommandOptions {
  targetAgent?: string;
}

export async function agentCommand(options?: AgentCommandOptions): Promise<void> {
  const { targetAgent } = options || {};

  // Load configuration
  const config = new ConfigManager();
  const cfg = await config.load();

  // Detect available agents
  const available = await detectAvailableAgents();

  if (available.length === 0) {
    console.log('\n  No AI agents detected on your system.\n');
    console.log('Please install one of the following:');
    for (const agent of SUPPORTED_AGENTS) {
      console.log(`  - ${agent.displayName}: ${agent.installUrl}`);
    }
    console.log('');
    return;
  }

  // If target agent is specified, switch to that agent
  if (targetAgent) {
    const agent = getAgentByName(targetAgent);
    if (!agent) {
      console.error(`\nError: Agent '${targetAgent}' not found.\n`);
      console.log('Available agents:');
      for (const a of available) {
        console.log(`  - ${a.name}`);
      }
      console.log('');
      return;
    }

    // Check if agent is available
    const isAvailable = available.find((a) => a.name === agent.name);
    if (!isAvailable) {
      console.error(`\nError: Agent '${agent.displayName}' is not installed or not in PATH.\n`);
      return;
    }

    // Switch to the agent
    await config.save({
      selectedAgent: agent.name,
      lastUsedAt: new Date().toISOString(),
    });

    console.log(`\n✓ Switched to ${agent.displayName}\n`);
    return;
  }

  // List available agents
  console.log('\nAvailable AI Agents:\n');

  for (const agent of available) {
    const isCurrent = cfg.selectedAgent === agent.name;
    const marker = isCurrent ? '●' : '○';
    const status = isCurrent ? ' (current)' : '';

    console.log(`  ${marker} ${agent.displayName}${status}`);
    console.log(`    ${agent.description}`);
    console.log(`    Command: ${agent.command}`);
    console.log('');
  }

  if (!cfg.selectedAgent) {
    console.log('No agent selected. Use "clix agent <name>" to select one.\n');
  } else {
    console.log('To switch agents, run "clix agent <name>"\n');
  }
}
