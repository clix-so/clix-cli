# Clix CLI

An interactive AI-powered assistant for Clix SDK development. Built with React and Ink, Clix CLI provides a chat interface with AI agents to help you integrate, debug, and manage the Clix Mobile SDK in your projects.

## Features

- **Interactive Chat Interface**: Natural conversation with AI agents using streaming responses
- **Multiple AI Agents**: Support for Claude, Codex, Gemini, OpenCode, Cursor, and GitHub Copilot
- **Slash Commands**: Quick actions for common tasks and workflows
- **Skills System**: Pre-built workflows for SDK integration, event tracking, user management, and personalization
- **Debug Assistant**: Interactive problem diagnosis and root cause analysis
- **Session Transfer**: Save and continue conversations in native agent CLIs
- **Agent Switching**: Switch between agents mid-conversation with full history preservation
- **Context Management**: Real-time tracking with automatic history compaction at 90% threshold
- **MCP Server Integration**: Built-in installer for Clix MCP Server

## Installation

### Install via npm (Recommended)

```bash
npm install -g @clix-so/clix-cli
```

### Install via Bun

```bash
bun add -g @clix-so/clix-cli
```

### Install via Script

```bash
curl -fsSL https://clix.sh/install.sh | bash
```

### Install via Homebrew (macOS)

```bash
brew tap clix-so/clix-cli
brew install clix
```

### Uninstallation

See [UNINSTALL.md](UNINSTALL.md) for instructions on how to remove Clix CLI.

## Prerequisites

- **Node.js 20+** (Bun v1.0+ is optional for faster development)
- **One of the following AI agents**:

| Agent | Free Plan | CLI Free Usage |
|-------|:---------:|----------------|
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ | 1,000 requests/day |
| [GitHub Copilot](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli) | ✅ | 50 premium requests/month |
| [OpenCode](https://opencode.ai/docs/cli/) | ✅ | Unlimited (with your own API keys) |
| [Cursor](https://cursor.com/cli) | ⚠️ | 50 slow requests/month |
| [Claude Code](https://code.claude.com/docs) | ❌ | Requires Pro ($20/mo) or API |
| [Codex](https://developers.openai.com/codex/cli) | ❌ | Requires ChatGPT Plus ($20/mo) or API |

> **💡 Tip:** If you don't have an active subscription, we recommend starting with **Gemini CLI** or **GitHub Copilot** which offer generous free tiers.

## Quick Start

1. **Start interactive chat**:

```bash
clix
```

2. **Select your AI agent** (if multiple are available):

```bash
clix agent claude
```

3. **Use natural language or slash commands**:

```
> How do I integrate Clix SDK into my iOS project?
> /debug
> /integration
```

## Commands

### `clix` (default)

Start an interactive chat session with your configured AI agent.

```bash
clix
```

**Features:**

- Natural language conversation
- Real-time streaming responses
- Slash commands for quick actions
- Context tracking with usage indicators
- History navigation (↑/↓ arrows)
- Press Escape to cancel streaming

**Shortcuts:**

- `/help` - Show all available commands
- `/debug` - Interactive debugging assistant
- `/install` - Autonomous SDK installation
- `/doctor` - SDK health check
- `/integration` - Interactive SDK integration guide
- `/agent` - Switch AI agents
- `/transfer` - Transfer session to native CLI
- `/exit` - Exit chat

### `clix agent [name]`

List available AI agents or switch to a specific agent.

```bash
# List available agents
clix agent

# Switch to Claude
clix agent claude

# Switch to Codex
clix agent codex
```

Detects available agents (Claude, Codex, Gemini, OpenCode, Cursor, GitHub Copilot) on your system. Your selection is saved to `~/.config/clix/config.json`.

### `clix install`

Autonomous SDK installation with automatic file modifications. The AI agent will detect your platform, install dependencies, create initialization files, and integrate the SDK without manual intervention.

```bash
clix install

# Specify target platform
clix install --platform react-native
clix install --platform ios
```

**Options:**

- `--platform <platform>` - Target platform (ios, android, react-native, flutter)

**iOS Dependency Managers:**

The install command automatically detects and supports both Swift Package Manager (SPM) and CocoaPods:
- **SPM (Recommended)**: Detected via `Package.swift` or Xcode project with SPM packages
- **CocoaPods**: Detected via `Podfile`

### `clix doctor`

Analyze SDK integration status in your project.

```bash
clix doctor
```

### `clix ios-setup`

Configure iOS capabilities and Notification Service Extension (NSE) for the Clix SDK.

```bash
clix ios-setup
```

**What it does:**
1. Analyzes your iOS project structure
2. Checks current capabilities status (Push Notifications, App Groups)
3. Creates/modifies entitlements files
4. Guides NSE setup for rich push notifications:
   - Creates `{AppName}NotificationServiceExtension` target
   - Implements `NotificationService.swift` with `ClixNotificationServiceExtension`
   - Configures CocoaPods/SPM dependencies for extension target
   - Sets build settings (`ENABLE_USER_SCRIPT_SANDBOXING` for Xcode 15+)
5. Guides you through Xcode and Apple Developer Portal configuration

**Note:** Some steps require manual action in Xcode and Apple Developer Portal.

### `clix update`

Check for and install CLI updates.

```bash
# Check for updates and install with confirmation
clix update

# Preview update without executing
clix update --dry-run

# Skip confirmation prompt
clix update --force
```

**Options:**

- `--dry-run` - Preview update without executing
- `--force` - Skip confirmation prompt

### Interactive Skills (Chat Mode Only)

The following skills require step-by-step guidance and are only available in chat mode. Run `clix` to start interactive chat, then use `/<skill>` commands.

#### `integration`

SDK integration guide with step-by-step instructions. Unlike `clix install`, this provides interactive guidance for manual integration.

```
> clix
> /integration
```

#### `event-tracking`

Event tracking setup with `Clix.trackEvent()`.

```
> clix
> /event-tracking
```

#### `user-management`

User management and identification setup.

```
> clix
> /user-management
```

#### `personalization`

Personalization templates setup.

```
> clix
> /personalization
```

#### `api-triggered-campaigns`

API-triggered campaign setup.

```
> clix
> /api-triggered-campaigns
```

### `clix debug <problem>`

Interactive debugging assistant for troubleshooting issues.

```bash
clix debug "Push notifications not working on iOS"
```

### `clix install-mcp [agent]`

Install Clix MCP Server for enhanced AI assistance.

```bash
# Auto-detect agent
clix install-mcp

# Install for specific agent
clix install-mcp claude
clix install-mcp codex
```

## Slash Commands

Use these commands within the interactive chat (`clix`):

### Autonomous Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/install` | | Autonomous SDK installation |
| `/doctor` | | Check SDK integration status |
| `/debug` | | Interactive debugging assistant |
| `/ios-setup` | `/capabilities`, `/ios-capabilities` | Configure iOS capabilities and NSE |

### Interactive Skills

| Command | Aliases | Description |
|---------|---------|-------------|
| `/integration` | | SDK integration guide |
| `/event-tracking` | | Event tracking setup |
| `/user-management` | | User management setup |
| `/personalization` | | Personalization templates |
| `/api-triggered-campaigns` | | API-triggered campaign setup |

### System

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | /?, /h | Show available commands |
| `/new` | /clear | Start a new session |
| `/compact` | /c | Compress conversation history |
| `/agent` | /a | List or switch agents |
| `/firebase` | | Check and configure Firebase credentials |
| `/transfer` | /t | Transfer to agent CLI |
| `/resume` | | Resume a previous session |
| `/install-mcp` | /mcp | Install Clix MCP Server |
| `/update` | /upgrade | Check for available updates |
| `/exit` | /quit, /q | Exit the chat |

## Interactive Features

### Debug Assistant

The `/debug` command provides interactive problem diagnosis:

1. Type `/debug` in chat
2. Describe your problem (e.g., "Push notifications not working on iOS")
3. AI investigates your project structure and code
4. Receive root cause analysis and recommended fixes

```
> /debug
Describe the problem: Events not appearing in Clix dashboard
[AI explores project, identifies issue, provides fixes]
```

### Session Transfer

Transfer your conversation to continue in the native agent CLI:

```
> /transfer claude
✅ Session saved to ~/.local/state/clix/session-1234567890.md

To continue in Claude Code:
claude "$(cat ~/.local/state/clix/session-1234567890.md)"
```

This preserves your entire conversation history and allows you to continue seamlessly in the agent's native interface.

### Agent Switching

Switch between agents without losing your conversation:

```
> /agent gemini
Switching to Gemini...
[Conversation history preserved]
```

### Skills

Pre-built workflows for common SDK tasks. Skills automatically detect your platform (iOS, Android, React Native, Flutter) and follow Clix SDK best practices.

- **Autonomous Commands** (`/install`, `/doctor`, `/debug`): Can be run from command-line (`clix install`) or chat mode
- **Interactive Skills** (`/integration`, `/event-tracking`, `/user-management`, `/personalization`, `/api-triggered-campaigns`): Require step-by-step guidance, available only in chat mode

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guide.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/clix-so/clix-cli.git
cd clix-cli

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build
bun run build

# Compile binaries
bun run build:binary

# Run tests
bun test
```

## Contributing

Pull requests and issues are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup and workflow
- Code contribution process
- Testing guidelines
- Release process

## License

MIT

## Links

- [GitHub Repository](https://github.com/clix-so/clix-cli)
- [Issue Tracker](https://github.com/clix-so/clix-cli/issues)
- [Homebrew Tap](https://github.com/clix-so/homebrew-clix-cli)
- [Clix SDK Documentation](https://clix.so)
- [LLMs.txt](llms.txt) - Detailed documentation for AI assistants

---

Made with love by the Clix team
