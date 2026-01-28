# Uninstalling Clix CLI

This guide explains how to uninstall Clix CLI based on your installation method.

## CLI Command (Recommended)

The easiest way to uninstall Clix CLI is using the built-in command:

```bash
# Basic uninstall (keeps config and state files)
clix uninstall

# Preview what will be removed (dry run)
clix uninstall --dry-run

# Complete uninstall (removes everything)
clix uninstall --force

# Keep specific data
clix uninstall --keep-config  # Keep configuration files
clix uninstall --keep-state   # Keep session/state files
```

**Note:** For npm/bun/yarn/pnpm installations, the CLI command will guide you to use the appropriate package manager uninstall command. For binary installations, you'll need to manually remove the binary after running the command.

## npm / Bun / GitHub installation

```bash
# If installed via npm or GitHub
npm uninstall -g @clix-so/clix-cli

# If installed via Bun
bun remove -g @clix-so/clix-cli
```

## Script installation

If you installed using the bash script (`curl -fsSL https://clix.sh/install.sh | bash`):

### One-line Uninstall (Recommended)

```bash
# Basic uninstall (removes binary only)
curl -fsSL https://clix.sh/uninstall.sh | bash

# Complete uninstall (removes binary, config, and state files)
curl -fsSL https://clix.sh/uninstall.sh | CLIX_REMOVE_CONFIG=true bash

# Full cleanup (removes everything including PATH configuration)
curl -fsSL https://clix.sh/uninstall.sh | CLIX_REMOVE_CONFIG=true CLIX_REMOVE_PATH=true bash
```

### Manual Uninstall

Alternatively, you can remove components manually:

```bash
# Remove binary
rm -f ~/.local/bin/clix
```

## Homebrew installation

```bash
brew uninstall clix
brew untap clix-so/clix-cli  # Optional: remove tap
```

## Remove configuration files (Optional)

To completely remove all Clix CLI data including configuration and session files:

```bash
# Remove configuration directory
rm -rf ~/.config/clix

# Remove session files (state directory)
rm -rf ~/.local/state/clix
```

If you have custom XDG environment variables set, use:

```bash
# Remove configuration directory
rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/clix"

# Remove session files (state directory)
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/clix"
```

This removes:
- `$XDG_CONFIG_HOME/clix/config.json` (default: `~/.config/clix/config.json`) - User configuration
- `$XDG_STATE_HOME/clix/sessions/` (default: `~/.local/state/clix/sessions/`) - Session files
- `$XDG_STATE_HOME/clix/session-*.md` (default: `~/.local/state/clix/session-*.md`) - Saved session files
