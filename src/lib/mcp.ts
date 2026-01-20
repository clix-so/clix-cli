import { spawn } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir as osHomedir } from 'node:os';
import { join } from 'node:path';

// Use HOME env var if set (for testing), otherwise use os.homedir()
function getHomeDir(): string {
  return process.env.HOME ?? osHomedir();
}

const MCP_SERVER_REPO = 'https://github.com/clix-so/clix-mcp-server';
const MCP_SERVER_NAME = 'clix-mcp-server';

interface MCPServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

export class MCPInstaller {
  async getMCPConfigPath(toolName: string): Promise<string> {
    const home = getHomeDir();
    let configDir: string;
    let configFile: string;

    switch (toolName) {
      case 'claude':
        configDir = join(home, '.config', 'claude');
        configFile = 'claude_desktop_config.json';
        break;

      case 'aider':
        configDir = join(home, '.aider');
        configFile = 'mcp_config.json';
        break;

      case 'gpt':
      case 'openai':
        configDir = join(home, '.config', 'openai');
        configFile = 'mcp_config.json';
        break;

      case 'gemini':
        configDir = join(home, '.config', 'gemini');
        configFile = 'mcp_config.json';
        break;

      default:
        configDir = join(home, '.config', 'mcp');
        configFile = `${toolName}_config.json`;
    }

    try {
      await stat(configDir);
    } catch {
      await mkdir(configDir, { recursive: true, mode: 0o755 });
    }

    return join(configDir, configFile);
  }

  async isServerInstalled(toolName: string): Promise<boolean> {
    try {
      const configPath = await this.getMCPConfigPath(toolName);

      if (!(await fileExists(configPath))) {
        return false;
      }

      const content = await readFile(configPath, 'utf-8');
      const config: MCPConfig = JSON.parse(content);
      return MCP_SERVER_NAME in config.mcpServers;
    } catch {
      return false;
    }
  }

  async installServer(toolName: string): Promise<void> {
    const npxExists = await commandExists('npx');
    if (!npxExists) {
      throw new Error('npx not found. Please install Node.js and npm first');
    }

    const configPath = await this.getMCPConfigPath(toolName);

    let config: MCPConfig = { mcpServers: {} };

    if (await fileExists(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        // Invalid JSON, start fresh
      }
    }

    config.mcpServers[MCP_SERVER_NAME] = {
      command: 'npx',
      args: ['-y', MCP_SERVER_REPO],
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));
  }

  async ensureServerInstalled(toolName: string): Promise<boolean> {
    const installed = await this.isServerInstalled(toolName);

    if (installed) {
      return true;
    }

    await this.installServer(toolName);
    return false;
  }
}
