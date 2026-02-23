# Clix CLI

Command-mode AI assistant for Clix SDK installation and diagnostics.

## Features

- Command-only workflow — no interactive chat mode
- Step-based `install` preparation flow for Firebase and iOS push setup
- Interactive agent handoff for `install` and `doctor` commands
- Built-in MCP server installer (`mcp`)
- Built-in skills installer (`skills`)

## Installation

### npm

```bash
npm install -g @clix-so/clix-cli
```

### Bun

```bash
bun add -g @clix-so/clix-cli
```

### Script

```bash
curl -fsSL https://clix.sh/install | bash
```

### Homebrew (macOS)

```bash
brew tap clix-so/clix-cli
brew install clix
```

See [UNINSTALL.md](UNINSTALL.md) for removal instructions.

## Prerequisites

- **Node.js 20+**
- **One of the following AI agents**:

| Agent | Free Plan | CLI Free Usage |
|-------|:---------:|----------------|
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Yes | 1,000 requests/day |
| [GitHub Copilot](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli) | Yes | 50 premium requests/month |
| [OpenCode](https://opencode.ai/docs/cli/) | Yes | Unlimited (with your own API keys) |
| [Cursor](https://cursor.com/cli) | Limited | 50 slow requests/month |
| [Claude Code](https://code.claude.com/docs) | No | Requires Pro ($20/mo) or API |
| [Codex](https://developers.openai.com/codex/cli) | No | Requires ChatGPT Plus ($20/mo) or API |

> **Tip:** If you don't have an active subscription, start with **Gemini CLI** or **GitHub Copilot** which offer generous free tiers.

## Quick Start

```bash
clix agent          # Select an AI agent
clix install        # Install Clix SDK into your project
clix doctor         # Diagnose SDK integration issues
```

## Commands

| Command | Description |
|---------|-------------|
| `clix` / `clix help` | Show help and exit |
| `clix agent [name]` | List available agents or switch the active agent |
| `clix install` | Run install preparation, then hand off to agent CLI |
| `clix doctor` | Run SDK diagnostics via agent handoff |
| `clix mcp` | Install Clix MCP Server |
| `clix skills` | Install Clix skill package |
| `clix update` | Check for and apply CLI updates |
| `clix login` / `logout` / `whoami` | Account and authentication |
| `clix uninstall` | Remove Clix CLI from your system |

### `clix install [--start-task <task>]`

Runs a two-phase install pipeline:

1. **Preparation UI** — guided step-by-step setup for Firebase, APNS, and iOS configuration
2. **Agent handoff** — launches the selected AI agent CLI with the install prompt

The `--start-task` flag is development-only and requires `CLIX_DEV_ENABLE_TASK_OVERRIDE=1`.

### `clix doctor`

Hands off to the selected AI agent CLI with a diagnostic prompt. The agent analyzes SDK integration status, dependency health, and configuration issues.

### `clix mcp`

Installs the Clix MCP Server via `npx add-mcp @clix-so/clix-mcp-server@latest --name clix`.

### `clix skills`

Installs the Clix skill package via `npx skills add clix-so/skills` and transfers CLI control.

### `clix update [--dry-run] [--force]`

Checks for CLI updates and applies them. Use `--dry-run` to preview without applying, `--force` to skip confirmation.

### `clix uninstall [--keep-config] [--keep-state] [--dry-run] [--force]`

Removes Clix CLI. Use `--keep-config` or `--keep-state` to preserve local data.

## Install Preparation Tasks

`clix install` enforces the following order for required preparation tasks:

1. Firebase Configuration Files
2. Firebase Service Account
3. APNS Key for Firebase
4. iOS Entitlements
5. Notification Service Extension

Runtime SDK installation executes only after all required preparation steps are complete.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

```bash
bun install          # Install dependencies
bun run dev          # Run CLI from source
bun run build        # Bundle for distribution
bun test             # Run all tests
bun run check        # Lint + typecheck
```

## Links

- [Clix SDK Documentation](https://clix.so)
- [Issue Tracker](https://github.com/clix-so/clix-cli/issues)
- [LLMs.txt](llms.txt) — Documentation for AI assistants

## License

MIT
