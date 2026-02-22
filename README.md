# Clix CLI

Command-mode AI assistant for Clix SDK installation and diagnostics.

## Features

- Command-only workflow (no interactive chat mode)
- Multiple AI agents: Claude, Codex, Gemini, OpenCode, Cursor, GitHub Copilot
- Step-based `install` preparation flow for Firebase/iOS push setup
- Interactive agent handoff for `install` and `doctor`
- Built-in MCP installer (`install-mcp`)

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

## Prerequisites

- Node.js 20+
- At least one supported AI agent installed on your machine

## Quick Start

```bash
clix --help
clix agent
clix install
clix doctor
```

## Commands

### `clix` (no args)

Shows help and exits.

### `clix help`

Shows help and exits.

### `clix agent [name]`

Lists available AI agents or switches the active agent.

### `clix install [--platform <platform>] [--start-task <task>]`

Runs the install pipeline:

1. Preparation UI (step-by-step)
2. Interactive handoff to the selected agent CLI with the install prompt

Supported platforms: `ios`, `android`, `react-native`, `flutter`.

`--start-task` is development-only and requires `CLIX_DEV_ENABLE_TASK_OVERRIDE=1`.

### `clix doctor [--platform <platform>]`

Hands off to the selected agent CLI with the doctor prompt for SDK diagnostics.

### `clix install-mcp [agent]`

Installs Clix MCP server for the selected/specified agent.

### `clix update [--dry-run] [--force]`

Checks for updates and applies them (or previews with `--dry-run`).

### `clix login` / `clix logout` / `clix whoami`

Account/authentication commands.

### `clix uninstall [--keep-config] [--keep-state] [--dry-run] [--force]`

Uninstalls Clix CLI.

## Install Preparation Order (iOS / push-related)

`clix install` enforces the following order for required preparation tasks:

1. Firebase Configuration Files
2. Firebase Service Account
3. APNS Key for Firebase
4. iOS Entitlements
5. Notification Service Extension

Runtime installation executes only after required preparation steps are complete.

## Notes

- `project-build` is internal-only and not exposed as a user command.
