#!/bin/bash
set -e

# Clix CLI Uninstaller
# Usage: curl -fsSL https://cli.clix.so/uninstall.sh | bash
#   or:  CLIX_REMOVE_CONFIG=true curl -fsSL ... | bash
#
# Environment Variables:
#   CLIX_REMOVE_CONFIG  - Remove config and state files (default: false)
#   CLIX_REMOVE_PATH    - Remove PATH from shell configs (default: false)
#   CLIX_INSTALL_DIR    - Installation directory (default: ~/.local/bin)

CLIX_REMOVE_CONFIG="${CLIX_REMOVE_CONFIG:-false}"
CLIX_REMOVE_PATH="${CLIX_REMOVE_PATH:-false}"
CLIX_INSTALL_DIR="${CLIX_INSTALL_DIR:-$HOME/.local/bin}"

# XDG paths
CLIX_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/clix"
CLIX_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/clix"
CLIX_BIN_PATH="$CLIX_INSTALL_DIR/clix"

# Legacy paths (pre-XDG migration)
LEGACY_CLIX_DIR="$HOME/.clix"

# Colors (only if terminal supports them)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

tildify() {
  if [[ $1 = $HOME/* ]]; then
    echo "${1/$HOME\//~/}"
  else
    echo "$1"
  fi
}

# --- Removal functions ---

remove_binary() {
  if [ -f "$CLIX_BIN_PATH" ]; then
    info "Removing binary from $(tildify "$CLIX_BIN_PATH")..."
    rm -f "$CLIX_BIN_PATH"
    info "Binary removed"
  else
    warn "Binary not found at $(tildify "$CLIX_BIN_PATH")"
  fi
}

remove_config() {
  if [ -d "$CLIX_CONFIG_DIR" ]; then
    info "Removing config directory $(tildify "$CLIX_CONFIG_DIR")..."
    rm -rf "$CLIX_CONFIG_DIR"
    info "Config directory removed"
  else
    info "Config directory not found at $(tildify "$CLIX_CONFIG_DIR")"
  fi
}

remove_state() {
  if [ -d "$CLIX_STATE_DIR" ]; then
    info "Removing state directory $(tildify "$CLIX_STATE_DIR")..."
    rm -rf "$CLIX_STATE_DIR"
    info "State directory removed"
  else
    info "State directory not found at $(tildify "$CLIX_STATE_DIR")"
  fi
}

remove_legacy() {
  if [ -d "$LEGACY_CLIX_DIR" ]; then
    info "Removing legacy directory $(tildify "$LEGACY_CLIX_DIR")..."
    rm -rf "$LEGACY_CLIX_DIR"
    info "Legacy directory removed"
  fi
}

remove_path_from_file() {
  local config="$1"
  local marker="# clix"

  if [ ! -f "$config" ]; then
    return 0
  fi

  if ! grep -q "$marker" "$config" 2>/dev/null; then
    return 0
  fi

  # Create temp file
  local temp_file
  temp_file=$(mktemp)

  # Remove lines with marker and the following export/set line
  awk -v marker="$marker" '
    $0 ~ marker { skip=1; next }
    skip && /^(export PATH=|set -gx PATH)/ { skip=0; next }
    skip { skip=0 }
    { print }
  ' "$config" > "$temp_file"

  # Replace original file
  mv "$temp_file" "$config"
  info "Removed PATH configuration from $(tildify "$config")"
}

remove_path_from_shell() {
  local shell_name
  shell_name=$(basename "$SHELL" 2>/dev/null || echo "bash")

  case "$shell_name" in
    zsh)
      remove_path_from_file "$HOME/.zshrc"
      ;;
    bash)
      remove_path_from_file "$HOME/.bashrc"
      remove_path_from_file "$HOME/.bash_profile"
      remove_path_from_file "$HOME/.profile"
      ;;
    fish)
      remove_path_from_file "$HOME/.config/fish/config.fish"
      ;;
    *)
      warn "Unknown shell: $shell_name"
      warn "You may need to remove the following from your shell config manually:"
      echo "  export PATH=\"\$PATH:$CLIX_INSTALL_DIR\""
      ;;
  esac
}

# --- Confirmation prompt ---

confirm_uninstall() {
  # Skip confirmation if non-interactive (piped input)
  if [ ! -t 0 ]; then
    return 0
  fi

  echo ""
  warn "This will remove Clix CLI from your system."

  if [ "$CLIX_REMOVE_CONFIG" = "true" ]; then
    warn "Config and state files will also be removed."
  else
    info "Config and state files will be preserved (use CLIX_REMOVE_CONFIG=true to remove)."
  fi

  if [ "$CLIX_REMOVE_PATH" = "true" ]; then
    warn "PATH configuration will be removed from shell config files."
  else
    info "PATH configuration will be preserved (use CLIX_REMOVE_PATH=true to remove)."
  fi

  echo ""
  read -p "Continue? [y/N] " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Uninstall cancelled"
    exit 0
  fi
}

# --- Main uninstallation ---

uninstall_clix() {
  info "Clix CLI Uninstaller"
  echo ""

  # Confirmation
  confirm_uninstall

  echo ""
  info "Starting uninstallation..."
  echo ""

  # Remove binary (always)
  remove_binary

  # Remove config and state (optional)
  if [ "$CLIX_REMOVE_CONFIG" = "true" ]; then
    remove_config
    remove_state
    remove_legacy
  fi

  # Remove PATH from shell config (optional)
  if [ "$CLIX_REMOVE_PATH" = "true" ]; then
    remove_path_from_shell
  fi

  echo ""
  info "Uninstallation complete!"

  if [ "$CLIX_REMOVE_CONFIG" != "true" ]; then
    echo ""
    info "Your config and session data are preserved at:"
    echo "  - $(tildify "$CLIX_CONFIG_DIR")"
    echo "  - $(tildify "$CLIX_STATE_DIR")"
    echo ""
    info "To remove them, run:"
    echo "  rm -rf $(tildify "$CLIX_CONFIG_DIR") $(tildify "$CLIX_STATE_DIR")"
  fi

  if [ "$CLIX_REMOVE_PATH" != "true" ]; then
    echo ""
    info "PATH configuration is preserved in your shell config."
    info "To remove it manually, delete lines with '# clix' marker from:"
    echo "  - ~/.zshrc (zsh)"
    echo "  - ~/.bashrc, ~/.bash_profile, ~/.profile (bash)"
    echo "  - ~/.config/fish/config.fish (fish)"
  fi
}

# Run uninstaller
uninstall_clix
