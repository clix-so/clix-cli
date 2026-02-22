import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import open from 'open';
import type { AgentInfo } from '@/lib/agents';

const VERCEL_SKILLS_REPO_URL = 'https://github.com/vercel-labs/skills';
const VERCEL_AGENT_SKILLS_REPO = 'vercel-labs/agent-skills';

interface SkillsAgentMapping {
  skillsAgentId: string;
  projectPath: string[];
  globalPath: string[];
}

const AGENT_SKILLS_MAPPINGS: Record<string, SkillsAgentMapping> = {
  claude: {
    skillsAgentId: 'claude-code',
    projectPath: ['.claude', 'skills'],
    globalPath: ['.claude', 'skills'],
  },
  codex: {
    skillsAgentId: 'codex',
    projectPath: ['.agents', 'skills'],
    globalPath: ['.codex', 'skills'],
  },
  gemini: {
    skillsAgentId: 'gemini-cli',
    projectPath: ['.agents', 'skills'],
    globalPath: ['.gemini', 'skills'],
  },
  opencode: {
    skillsAgentId: 'opencode',
    projectPath: ['.agents', 'skills'],
    globalPath: ['.config', 'opencode', 'skills'],
  },
  cursor: {
    skillsAgentId: 'cursor',
    projectPath: ['.agents', 'skills'],
    globalPath: ['.cursor', 'skills'],
  },
  copilot: {
    skillsAgentId: 'github-copilot',
    projectPath: ['.agents', 'skills'],
    globalPath: ['.copilot', 'skills'],
  },
};

function resolveAgentMapping(agentName: string): SkillsAgentMapping {
  return (
    AGENT_SKILLS_MAPPINGS[agentName] ?? {
      skillsAgentId: 'codex',
      projectPath: ['.agents', 'skills'],
      globalPath: ['.config', 'agents', 'skills'],
    }
  );
}

function hasInstalledSkillsAtPath(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  const entries = readdirSync(path, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
}

export function hasVercelSkillsInstalled(
  agentName: string,
  projectPath: string = process.cwd(),
): boolean {
  const mapping = resolveAgentMapping(agentName);
  const projectSkillsPath = join(projectPath, ...mapping.projectPath);
  const globalSkillsPath = join(homedir(), ...mapping.globalPath);

  return hasInstalledSkillsAtPath(projectSkillsPath) || hasInstalledSkillsAtPath(globalSkillsPath);
}

export async function ensureVercelSkillsInstalled(
  agent: AgentInfo,
  commandName: string,
  projectPath: string = process.cwd(),
): Promise<boolean> {
  if (hasVercelSkillsInstalled(agent.name, projectPath)) {
    return true;
  }

  const mapping = resolveAgentMapping(agent.name);
  const installCommand = `npx skills add ${VERCEL_AGENT_SKILLS_REPO} --agent ${mapping.skillsAgentId}`;

  console.error('');
  console.error(
    `Vercel Skills is required before running '${commandName}' with ${agent.displayName}.`,
  );
  console.error('Open the repository guide and install skills, then retry this command:');
  console.error(`  ${installCommand}`);
  console.error('');
  console.error('After installation completes, run the same clix command again.');

  try {
    await open(VERCEL_SKILLS_REPO_URL);
    console.error(`Opened ${VERCEL_SKILLS_REPO_URL} in your browser.`);
  } catch {
    console.error(
      `Could not open browser automatically. Open this URL manually: ${VERCEL_SKILLS_REPO_URL}`,
    );
  }

  return false;
}
